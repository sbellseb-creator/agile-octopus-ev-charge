import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from "@/lib/cloud-sync";

const TABLE_LABEL: Record<string, string> = {
  charge_sessions: "Charging sessions",
  work_trips: "Work trips",
};

/** Compact, Fold-cover-safe cloud sync indicator with a tap-to-open diagnostic. */
export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeSync(setStatus), []);

  const map = {
    idle: { Icon: Cloud, cls: "text-primary", label: "Synced" },
    syncing: { Icon: RefreshCw, cls: "text-primary animate-spin", label: "Syncing" },
    offline: { Icon: CloudOff, cls: "text-muted-foreground", label: "Offline" },
    error: { Icon: AlertTriangle, cls: "text-destructive", label: "Retry" },
    "signed-out": { Icon: CloudOff, cls: "text-muted-foreground", label: "—" },
  } as const;

  const { Icon, cls, label } = map[status.state];
  const pending = status.pendingLocalChanges;

  const retry = async () => {
    const next = await syncNow();
    if (next.state === "idle") setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cloud sync: ${label}`}
          className="flex min-w-0 shrink items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
        >
          <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
          <span className="hidden truncate min-[360px]:inline">{label}</span>
          {pending > 0 && <span className="shrink-0 text-amber-500">{pending}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(19rem,calc(100vw-1.5rem))] space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Cloud sync</span>
          <span className={cls.replace("animate-spin", "")}>{label}</span>
        </div>
        <p className="text-muted-foreground">
          Last successful sync:{" "}
          {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString("en-GB") : "Never"}
        </p>
        <p className="text-muted-foreground">Pending local changes: {pending}</p>
        {status.state === "error" && (
          <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2">
            <p className="font-medium text-destructive">
              {status.failedTable ? `${TABLE_LABEL[status.failedTable] ?? status.failedTable} failed to sync` : "Sync failed"}
            </p>
            <p className="break-words text-muted-foreground">{status.message ?? "Unknown error"}</p>
            <p className="text-muted-foreground">
              Your data is still safe on this device and will upload once this succeeds.
            </p>
          </div>
        )}
        {status.state === "offline" && (
          <p className="text-muted-foreground">No connection — changes are stored on this device.</p>
        )}
        {!!status.quarantined && (
          <p className="text-amber-500">
            {status.quarantined} record(s) could not be uploaded and were skipped so the rest could sync.
          </p>
        )}
        <Button size="sm" className="w-full" onClick={retry} disabled={status.state === "syncing"}>
          {status.state === "syncing" ? "Syncing…" : "Retry sync now"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
