import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { TeslaSchedule } from "@/lib/teslaScheduler";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Tesla Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
  {!schedule ? (
    <p className="text-sm text-muted-foreground">
      No charging schedule available.
    </p>
  ) : (
    <>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex justify-between">
          <span>Start</span>
          <strong>{schedule.startTime}</strong>
        </div>

        <div className="flex justify-between">
          <span>Finish</span>
          <strong>{schedule.endTime}</strong>
        </div>

        <div className="flex justify-between">
          <span>Target SoC</span>
          <strong>{schedule.targetSoc}%</strong>
        </div>

        <div className="flex justify-between">
          <span>Charge Limit</span>
          <strong>{schedule.chargeLimit}%</strong>
        </div>
      </div>

      <div>
        <h4 className="font-medium mb-2">Charging Windows</h4>

        <div className="space-y-2">
          {schedule.windows.map((window, index) => (
            <div
              key={index}
              className="rounded border p-2 text-sm"
            >
              {window.start} → {window.end}
            </div>
          ))}
        </div>
      </div>
    </>
  )}
</div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button>
            Send to Tesla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}