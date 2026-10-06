import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { corsHeaders } from "../_shared/cors.ts";
import { getAuthedUserId, logEvent, serviceClient } from "../_shared/auth.ts";
import {
  type NotificationType, type PriceSlot, addDays, averagePrice, buildNotificationMessage,
  notificationKey, notificationTargetDate, parseFormulaOverrides, shouldSendNotification,
  slotsForUkDate, ukDate, ukMidnightUtc,
} from "../_shared/agile-core.ts";
import { estimateAgileDay, getProvider } from "../_shared/crystal-provider.ts";
import { fetchOfficialRates } from "../_shared/octopus-official.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const REGION = (Deno.env.get("AGILE_REGION") || "F").toUpperCase();
const MIN_FULL_DAY_SLOTS = 46; // tolerate DST days (46/50 slots)
const PREF_COLUMN: Record<NotificationType, string> = {
  estimate_ready: "notify_estimate",
  official_released: "notify_official",
};

function configureVapid() {
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!pub || !priv || !subject) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not configured");
  webpush.setVapidDetails(subject, pub, priv);
}

async function loadDay(type: NotificationType, today: string, tomorrow: string) {
  const dayRange = (d: string) => [ukMidnightUtc(d).toISOString(), ukMidnightUtc(addDays(d, 1)).toISOString()] as const;
  const [tf, tt] = dayRange(tomorrow);
  const [yf, yt] = dayRange(today);
  const todayOfficial = await fetchOfficialRates(yf, yt, REGION).catch(() => [] as PriceSlot[]);
  let tomorrowSlots: PriceSlot[];
  if (type === "official_released") {
    tomorrowSlots = await fetchOfficialRates(tf, tt, REGION);
  } else {
    const cfg = parseFormulaOverrides({
      AGILE_MULTIPLIER: Deno.env.get("AGILE_MULTIPLIER"), AGILE_PEAK_ADDER: Deno.env.get("AGILE_PEAK_ADDER"),
      AGILE_CAP: Deno.env.get("AGILE_CAP"), AGILE_FLOOR: Deno.env.get("AGILE_FLOOR"),
    });
    tomorrowSlots = await estimateAgileDay(getProvider(Deno.env.get("CRYSTAL_PROVIDER")), tomorrow, cfg);
  }
  tomorrowSlots = slotsForUkDate(tomorrowSlots, tomorrow);
  return { tomorrowSlots, todayAverage: averagePrice(slotsForUkDate(todayOfficial, today)) };
}

async function sendToSubs(
  subs: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: Record<string, unknown>,
) {
  const db = serviceClient();
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else logEvent("push-notify", "send_failed", { status }, "warn");
    }
  }
  return sent;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const db = serviceClient();
    const body = await req.json().catch(() => ({}));

    // Test notification: authenticated user, own subscriptions only.
    if (body?.test === true) {
      const userId = await getAuthedUserId(req);
      if (!userId) return json({ error: "Unauthorized" }, 401);
      configureVapid();
      const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", userId);
      if (!subs?.length) return json({ error: "No push subscription on this account" }, 404);
      const sent = await sendToSubs(subs, { title: "Test notification", body: "Crystal Ball notifications are working.", tag: "crystal-ball-test" });
      return json({ sent });
    }

    // Scheduled run: shared secret. Safe to call every few minutes.
    const secret = Deno.env.get("CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);
    configureVapid();

    const now = new Date();
    const today = ukDate(now);
    const tomorrow = notificationTargetDate(now);
    const results: Record<string, string> = {};

    for (const type of ["estimate_ready", "official_released"] as NotificationType[]) {
      const key = notificationKey(type, REGION, tomorrow);
      const { data: logged } = await db.from("notification_log").select("key").eq("key", key);
      // Cheap pre-check on window/dedupe before hitting external APIs.
      if (!shouldSendNotification({ type, now, region: REGION, hasData: true, alreadySentKeys: (logged ?? []).map((r) => r.key) })) {
        results[type] = "skipped";
        continue;
      }
      let day;
      try { day = await loadDay(type, today, tomorrow); } catch (e) {
        logEvent("push-notify", "data_error", { type, message: e instanceof Error ? e.message : "error" }, "warn");
        results[type] = "data_error";
        continue;
      }
      if (day.tomorrowSlots.length < MIN_FULL_DAY_SLOTS) { results[type] = "no_data_yet"; continue; }

      // Claim the key first; the PK makes concurrent runs de-duplicate.
      const { error: claimErr } = await db.from("notification_log").insert({ key, type, region: REGION, target_date: tomorrow });
      if (claimErr) { results[type] = "already_sent"; continue; }

      const { data: subs } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("region", REGION).eq(PREF_COLUMN[type], true);
      const msg = buildNotificationMessage({ type, tomorrow: day.tomorrowSlots, todayAverage: day.todayAverage });
      const sent = await sendToSubs(subs ?? [], { ...msg, tag: key, url: "/?tab=crystal" });
      results[type] = `sent:${sent}`;
    }
    return json({ results });
  } catch (e) {
    logEvent("push-notify", "error", { message: e instanceof Error ? e.message : "error" }, "error");
    return json({ error: "Internal error" }, 500);
  }
});
