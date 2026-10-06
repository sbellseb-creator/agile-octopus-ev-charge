import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  disablePush, enablePush, loadPrefs, pushConfigured, pushSupported, sendTestNotification, updatePrefs,
  type PushPrefs,
} from "@/lib/push";

export default function PushSettings() {
  const [prefs, setPrefs] = useState<PushPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (!supported) return;
    loadPrefs().then(setPrefs).catch(() => setPrefs(null));
  }, [supported]);

  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const toggleType = (key: keyof PushPrefs, value: boolean) =>
    run(async () => {
      const next = { ...(prefs ?? { notify_estimate: true, notify_official: true }), [key]: value };
      if (prefs) await updatePrefs({ [key]: value });
      else await enablePush(next);
      setPrefs(next);
    });

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-200">
        <Bell className="h-4 w-4 text-purple-400" /> Notifications (Region F)
      </div>
      {!supported && (
        <p className="text-[11px] text-amber-300">
          Push isn't available here. On iPhone/iPad, add this app to your Home Screen (Share → Add to Home Screen) and open it from there.
        </p>
      )}
      {supported && !pushConfigured() && (
        <p className="text-[11px] text-amber-300">Push is not configured yet (VAPID public key missing).</p>
      )}
      {supported && pushConfigured() && (
        <>
          <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>Crystal Ball estimate ready (~10:30–11:00 UK)</span>
            <Switch disabled={busy} checked={prefs?.notify_estimate ?? false} onCheckedChange={(v) => toggleType("notify_estimate", v)} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
            <span>Official rates released (~16:00 UK)</span>
            <Switch disabled={busy} checked={prefs?.notify_official ?? false} onCheckedChange={(v) => toggleType("notify_official", v)} />
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || !prefs} onClick={() => run(sendTestNotification, "Test notification sent")}>
              Send test notification
            </Button>
            {prefs && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(async () => { await disablePush(); setPrefs(null); }, "Notifications turned off")}>
                Turn all off
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
