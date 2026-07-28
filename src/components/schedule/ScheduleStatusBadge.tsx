import { Badge } from "@/components/ui/badge";
import { CheckCircle2, CircleAlert, CircleSlash, Clock, FileText, Loader2, TriangleAlert } from "lucide-react";
import type { ScheduleStatus } from "@/lib/charge-schedule";
import { cn } from "@/lib/utils";

/**
 * Provider-agnostic scheduling status chip. Tesla is the only provider wired up
 * today; another provider can reuse this by passing its own label.
 */
const MAP: Record<ScheduleStatus, { label: string; icon: typeof Clock; className: string }> = {
  app_plan: { label: "App plan only", icon: FileText, className: "border-muted-foreground/40 text-muted-foreground" },
  pending: { label: "Sending…", icon: Loader2, className: "border-primary/50 text-primary" },
  confirmed: { label: "Scheduled on Tesla", icon: CheckCircle2, className: "border-primary/60 bg-primary/10 text-primary" },
  removed: { label: "Removed from Tesla", icon: CircleSlash, className: "border-muted-foreground/40 text-muted-foreground" },
  failed: { label: "Failed to send", icon: TriangleAlert, className: "border-destructive/60 bg-destructive/10 text-destructive" },
  differs: { label: "Tesla schedule differs", icon: CircleAlert, className: "border-amber-500/60 bg-amber-500/10 text-amber-500" },
  unknown_external: { label: "External Tesla schedule", icon: CircleAlert, className: "border-amber-500/50 text-amber-500" },
};

export default function ScheduleStatusBadge({
  status,
  readyToSend,
  className,
}: {
  status: ScheduleStatus;
  /** Shows "Ready to send" instead of "App plan only" when a vehicle can receive it. */
  readyToSend?: boolean;
  className?: string;
}) {
  const cfg = MAP[status] ?? MAP.app_plan;
  const label = status === "app_plan" && readyToSend ? "Ready to send" : cfg.label;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 whitespace-nowrap text-[10px] sm:text-xs", cfg.className, className)}>
      <Icon className={cn("h-3 w-3 shrink-0", status === "pending" && "animate-spin")} />
      {label}
    </Badge>
  );
}
