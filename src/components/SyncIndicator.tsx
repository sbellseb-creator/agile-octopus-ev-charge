import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertTriangle } from "lucide-react";
import { getSyncStatus, subscribeSync, syncNow, type SyncStatus } from "@/lib/cloud-sync";

/** Compact, Fold-cover-safe cloud sync indicator. Icon-only under 360px. */
export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

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

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={status.message ?? (status.lastSyncedAt ? `Last synced ${new Date(status.lastSyncedAt).toLocaleString("en-GB")}` : label)}
      aria-label={`Cloud sync: ${label}`}
      className="flex min-w-0 shrink items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
    >
      <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
      <span className="hidden truncate min-[360px]:inline">{label}</span>
      {pending > 0 && <span className="shrink-0 text-amber-500">{pending}</span>}
    </button>
  );
}
