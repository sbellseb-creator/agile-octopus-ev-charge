import { Badge } from "@/components/ui/badge";
import { BadgeCheck, CheckCircle2, CircleAlert, CircleSlash, Clock, FileText, Loader2, PlugZap, TriangleAlert } from "lucide-react";
import type { ScheduleStatus } from "@/lib/charge-schedule";
import { cn } from "@/lib/utils";

/** Extra, purely presentational states the review card can be in. */
export type BadgeState = ScheduleStatus | "checking" | "not_connected";

/**
 * Provider-agnostic scheduling status chip. Tesla is the only provider wired up
 * today; another provider can reuse this by passing its own label.
 */
const MAP: Record<BadgeState, { label: string; icon: typeof Clock; className: string }> = {
  app_plan: { label: "Saved in planner only", icon: FileText, className: "border-amber-400/50 text-amber-400" },
  pending: { label: "Sending to Tesla…", icon: Loader2, className: "border-primary/50 text-primary" },
  checking: { label: "Checking Tesla…", icon: Loader2, className: "border-orange-400/60 text-orange-400" },
  confirmed: { label: "Scheduled on Tesla", icon: CheckCircle2, className: "border-primary/60 bg-primary/10 text-primary" },
  removed: { label: "Removed from Tesla", icon: CircleSlash, className: "border-muted-foreground/40 text-muted-foreground" },
  failed: { label: "Failed to send", icon: TriangleAlert, className: "border-destructive/60 bg-destructive/10 text-destructive" },
  differs: { label: "Tesla schedule differs", icon: CircleAlert, className: "border-orange-500/60 bg-orange-500/10 text-orange-400" },
  unknown_external: { label: "External Tesla schedule", icon: CircleAlert, className: "border-orange-500/50 text-orange-400" },
  not_connected: { label: "Tesla connection required", icon: PlugZap, className: "border-destructive/60 bg-destructive/10 text-destructive" },
};

export default function ScheduleStatusBadge({
  status,
  readyToSend,
  verified,
  className,
}: {
  status: BadgeState;
  /** Shows "Ready to send" instead of "Saved in planner only" when a vehicle can receive it. */
  readyToSend?: boolean;
  /** Confirmed schedules that were read back and matched show "Verified on Tesla". */
  verified?: boolean;
  className?: string;
}) {
  const cfg = MAP[status] ?? MAP.app_plan;
  let label = cfg.label;
  let Icon = cfg.icon;
  if (status === "app_plan" && readyToSend) label = "Ready to send";
  if (status === "confirmed" && verified) {
    label = "Verified on Tesla";
    Icon = BadgeCheck;
  }
  return (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap text-[10px] sm:text-xs", cfg.className, className)}>
      <Icon className={cn("h-3 w-3 shrink-0", (status === "pending" || status === "checking") && "animate-spin")} />
      {label}
    </Badge>
  );
}
