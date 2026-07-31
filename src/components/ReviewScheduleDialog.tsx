import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { TeslaSchedule } from "@/lib/teslaScheduler";
import { sendScheduleToTesla } from "@/lib/teslaFleet";
import { formatUK } from "@/lib/timezone";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: TeslaSchedule;
}

export default function ReviewScheduleDialog({
  open,
  onOpenChange,
  schedule,
}: Props) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!schedule) return;

    setSending(true);

    try {
      const result = await sendScheduleToTesla(schedule);

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      console.error(err);

      toast.error("Unable to send schedule to Tesla.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={sending ? undefined : onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review Tesla Schedule</DialogTitle>
        </DialogHeader>

        {!schedule ? (
          <p className="text-sm text-muted-foreground">
            No charging schedule available.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between">
                <span>Vehicle</span>
                <strong>{schedule.vehicleName}</strong>
              </div>

              <div className="flex justify-between">
                <span>Start</span>
                <strong>{formatUK(schedule.startTime, "dd MMM HH:mm")}</strong>
              </div>

              <div className="flex justify-between">
                <span>Finish</span>
                <strong>{formatUK(schedule.endTime, "dd MMM HH:mm")}</strong>
              </div>

              <div className="flex justify-between">
                <span>Estimated Energy</span>
                <strong>
                  {schedule.estimatedEnergyKwh.toFixed(1)} kWh
                </strong>
              </div>

              <div className="flex justify-between">
                <span>Estimated Cost</span>
                <strong>£{schedule.estimatedCost.toFixed(2)}</strong>
              </div>

              <div className="flex justify-between">
                <span>Home Charger</span>
                <strong>
                  {schedule.chargerPowerKw} kW ({schedule.chargerCurrentA}A)
                </strong>
              </div>
            </div>

            <div>
              <h3 className="font-medium mb-2">
                Charging Windows ({schedule.slots.length})
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {schedule.slots.map((slot) => (
                  <div
                    key={slot.valid_from}
                    className="flex justify-between rounded border p-2 text-sm"
                  >
                    <span>
                      {formatUK(slot.valid_from, "HH:mm")} –{" "}
                      {formatUK(slot.valid_to, "HH:mm")}
                    </span>

                    <strong>
                      {slot.value_inc_vat.toFixed(2)} p/kWh
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button
            disabled={!schedule || sending}
            onClick={handleSend}
          >
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send to Tesla"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}