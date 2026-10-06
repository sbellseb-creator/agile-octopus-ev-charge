import { supabase } from "@/integrations/supabase/client";
import { AGILE_REGION } from "@/lib/agile-config";
import type { PushDiagnostics } from "@/lib/push-status";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushConfigured(): boolean {
  return !!VAPID_PUBLIC_KEY;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getRegistration() {
  const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}push-sw.js`);
  await navigator.serviceWorker.ready;
  return reg;
}

export interface PushPrefs { notify_estimate: boolean; notify_official: boolean }

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function loadPrefs(): Promise<PushPrefs | null> {
  const sub = await getCurrentSubscription();
  if (!sub) return null;
  const { data } = await supabase.from("push_subscriptions").select("notify_estimate,notify_official").eq("endpoint", sub.endpoint).maybeSingle();
  return data ?? null;
}

export async function enablePush(prefs: PushPrefs): Promise<void> {
  if (!pushSupported()) throw new Error("Push is not supported in this browser. On iPhone, add the app to the Home Screen first.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Push is not configured (missing VITE_VAPID_PUBLIC_KEY).");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Please sign in first.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notification permission was not granted.");
  const reg = await getRegistration();
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
  }));
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    region: AGILE_REGION,
    ...prefs,
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

export async function updatePrefs(prefs: Partial<PushPrefs>): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) throw new Error("Not subscribed");
  const { error } = await supabase.from("push_subscriptions").update({ ...prefs, updated_at: new Date().toISOString() }).eq("endpoint", sub.endpoint);
  if (error) throw new Error(error.message);
}

export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

const LAST_TEST_KEY = "push-last-test";

export function loadLastTest(): PushDiagnostics["lastTest"] {
  try { return JSON.parse(localStorage.getItem(LAST_TEST_KEY) ?? "null"); } catch { return null; }
}

function recordTest(ok: boolean, message?: string) {
  try { localStorage.setItem(LAST_TEST_KEY, JSON.stringify({ ok, at: new Date().toISOString(), message })); } catch { /* ignore */ }
}

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const supported = pushSupported();
  return {
    supported,
    configured: pushConfigured(),
    permission: supported ? Notification.permission : "unsupported",
    subscribed: supported ? !!(await getCurrentSubscription().catch(() => null)) : false,
    lastTest: loadLastTest(),
  };
}

export async function sendTestNotification(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke("push-notify", { method: "POST", body: { test: true } });
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    if (!data || data.sent < 1) throw new Error(data?.error ?? "No notification was delivered. Check your subscription.");
    recordTest(true);
  } catch (e) {
    recordTest(false, e instanceof Error ? e.message : "error");
    throw e;
  }
}
