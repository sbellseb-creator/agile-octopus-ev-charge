import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Briefcase,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  Route,
  Square,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import type { Vehicle } from "@/lib/vehicle-data";
import { formatUKDate } from "@/lib/date";
import {
  deleteWorkTrip,
  displayMiles,
  endWorkTrip,
  formatTripDate,
  getCurrentOdometer,
  loadActiveTrip,
  loadRecentTrips,
  startWorkTrip,
  type WorkTrip,
} from "@/lib/workTrips";

interface WorkMileageCardProps {
  vehicles: Vehicle[];
}

function durationText(
  startedAt: string,
  endedAt: string | null,
): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt
    ? new Date(endedAt).getTime()
    : Date.now();

  const totalMinutes = Math.max(
    0,
    Math.round((end - start) / 60_000),
  );

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    return remainingMinutes
      ? `${totalHours} hr ${remainingMinutes} min`
      : `${totalHours} hr`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  return hours
    ? `${days} day${days === 1 ? "" : "s"} ${hours} hr`
    : `${days} day${days === 1 ? "" : "s"}`;
}

export default function WorkMileageCard({
  vehicles,
}: WorkMileageCardProps) {
  const { toast } = useToast();

  const vehicle = useMemo(
    () =>
      vehicles.find(
        (item) =>
          item.is_default &&
          item.source === "tesla" &&
          Boolean(item.vin),
      ) ??
      vehicles.find(
        (item) =>
          item.source === "tesla" &&
          Boolean(item.vin),
      ),
    [vehicles],
  );

  const [trip, setTrip] = useState<WorkTrip | null>(
    null,
  );
  const [recentTrips, setRecentTrips] = useState<
    WorkTrip[]
  >([]);
  const [currentOdometer, setCurrentOdometer] =
    useState<number | null>(null);
  const [completedTrip, setCompletedTrip] =
    useState<WorkTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingTripId, setDeletingTripId] = useState<
    string | null
  >(null);
  const [tripToDelete, setTripToDelete] = useState<
    WorkTrip | null
  >(null);
  const [lastMileageUpdate, setLastMileageUpdate] =
    useState<Date | null>(null);

  const refreshCurrentMileage = useCallback(
    async (quiet = false) => {
      if (!vehicle?.vin || !trip) return;

      if (!quiet) {
        setRefreshing(true);
      }

      try {
        const reading = await getCurrentOdometer(
          vehicle.vin,
        );

        setCurrentOdometer(reading);
        setLastMileageUpdate(new Date());
      } catch (error) {
        if (!quiet) {
          toast({
            title: "Could not refresh mileage",
            description:
              error instanceof Error
                ? error.message
                : "Unknown Tesla error",
            variant: "destructive",
          });
        }
      } finally {
        if (!quiet) {
          setRefreshing(false);
        }
      }
    },
    [toast, trip, vehicle],
  );

  const load = useCallback(async () => {
    if (!vehicle) {
      setTrip(null);
      setRecentTrips([]);
      setCurrentOdometer(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [active, history] = await Promise.all([
        loadActiveTrip(vehicle.id),
        loadRecentTrips(vehicle.id, 5),
      ]);

      setTrip(active);
      setRecentTrips(history);
      setCurrentOdometer(
        active?.start_odometer_miles ?? null,
      );
    } catch (error) {
      toast({
        title: "Business Trips",
        description:
          error instanceof Error
            ? error.message
            : "Could not load business trips.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, vehicle]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!trip || !vehicle?.vin) return;

    void refreshCurrentMileage(true);

    const interval = window.setInterval(() => {
      void refreshCurrentMileage(true);
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    refreshCurrentMileage,
    trip,
    vehicle?.vin,
  ]);

  async function startTrip() {
    if (!vehicle?.vin) return;

    setWorking(true);
    setCompletedTrip(null);

    try {
      const created = await startWorkTrip({
        vehicleId: vehicle.id,
        vin: vehicle.vin,
      });

      setTrip(created);
      setCurrentOdometer(
        created.start_odometer_miles,
      );
      setLastMileageUpdate(new Date());

      toast({
        title: "Business trip started",
        description: `Starting odometer: ${displayMiles(
          created.start_odometer_miles,
        )}`,
      });
    } catch (error) {
      toast({
        title: "Could not start business trip",
        description:
          error instanceof Error
            ? error.message
            : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  }

  async function finishTrip() {
    if (!vehicle?.vin || !trip) return;

    setWorking(true);

    try {
      const completed = await endWorkTrip({
        trip,
        vin: vehicle.vin,
      });

      setCompletedTrip(completed);
      setTrip(null);
      setCurrentOdometer(null);
      setLastMileageUpdate(null);
      setRecentTrips((current) => [
        completed,
        ...current.filter(
          (item) => item.id !== completed.id,
        ),
      ].slice(0, 5));

      toast({
        title: "Business trip completed",
        description: `${displayMiles(
          completed.distance_miles,
        )} recorded.`,
      });
    } catch (error) {
      toast({
        title: "Could not end business trip",
        description:
          error instanceof Error
            ? error.message
            : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  }

  async function removeTrip(item: WorkTrip) {
setDeletingTripId(item.id);

    try {
      await deleteWorkTrip(item.id);

      setRecentTrips((current) =>
        current.filter((tripItem) => tripItem.id !== item.id)
      );

      if (completedTrip?.id === item.id) {
        setCompletedTrip(null);
      }

      setTripToDelete(null);

      toast({
        title: "Business trip deleted",
        description: "The trip has been removed.",
      });
    } catch (error) {
      toast({
        title: "Could not delete business trip",
        description:
          error instanceof Error
            ? error.message
            : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeletingTripId(null);
    }
  }

  const distanceSoFar =
    trip && currentOdometer != null
      ? Math.max(
          0,
          currentOdometer -
            trip.start_odometer_miles,
        )
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Business Trips
            </CardTitle>

            <CardDescription className="mt-1">
              Record work mileage directly from your
              Tesla odometer.
            </CardDescription>
          </div>

          {trip ? (
            <Badge className="gap-1">
              <span className="h-2 w-2 rounded-full bg-current" />
              Trip active
            </Badge>
          ) : (
            <Badge variant="outline">
              No active trip
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading business trips…
          </div>
        ) : !vehicle ? (
          <p className="text-sm text-muted-foreground">
            Connect a Tesla vehicle before using Work
            Mileage.
          </p>
        ) : trip ? (
          <>
            <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Started
                </p>
                <p className="mt-1 font-medium">
                  {formatTripDate(trip.started_at)}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Duration
                </p>
                <p className="mt-1 font-medium">
                  {durationText(
                    trip.started_at,
                    null,
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Start odometer
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {displayMiles(
                    trip.start_odometer_miles,
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Distance so far
                </p>
                <p className="mt-1 text-2xl font-semibold text-primary">
                  {displayMiles(distanceSoFar)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {lastMileageUpdate
                  ? `Mileage checked at ${lastMileageUpdate.toLocaleTimeString(
                      "en-GB",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}`
                  : "Checking current mileage…"}
              </p>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  void refreshCurrentMileage(false)
                }
                disabled={refreshing || working}
              >
                {refreshing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Route className="mr-2 h-4 w-4" />
                )}
                Check now
              </Button>
            </div>

            <Button
              type="button"
              size="lg"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => void finishTrip()}
              disabled={working}
            >
              {working ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              End Business Trip
            </Button>
          </>
        ) : (
          <>
            {completedTrip && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="font-semibold">
                      Business trip completed
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-primary">
                      {displayMiles(
                        completedTrip.distance_miles,
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatTripDate(
                        completedTrip.started_at,
                      )}
                      {" → "}
                      {completedTrip.ended_at
                        ? formatTripDate(
                            completedTrip.ended_at,
                          )
                        : "Completed"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border p-4">
              <p className="font-medium">
                {vehicle.name}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start whenever your work travel begins.
                A trip can last minutes, hours, or several
                days.
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              onClick={() => void startTrip()}
              disabled={working}
            >
              {working ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Business Trip
            </Button>
          </>
        )}

        <Separator />

        <section className="space-y-3">
          <div>
            <h3 className="font-semibold">
              Recent business trips
            </h3>
            <p className="text-sm text-muted-foreground">
              Your five most recently completed business trips.
            </p>
          </div>

          {recentTrips.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No completed business trips yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recentTrips.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                    <div>
                      <p className="font-medium">
                        {item.title || "Work Trip"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatTripDate(
                          item.started_at,
                        )}
                        {item.ended_at
                          ? ` · ${durationText(
                              item.started_at,
                              item.ended_at,
                            )}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">
                      {displayMiles(
                        item.distance_miles,
                      )}
                    </p>

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Delete business trip"
                      title="Delete business trip"
                      disabled={deletingTripId === item.id}
                      onClick={() => setTripToDelete(item)}
                    >
                      {deletingTripId === item.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>

      <AlertDialog
        open={tripToDelete !== null}
        onOpenChange={(open) => {
          if (!open && deletingTripId === null) {
            setTripToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete business trip?
            </AlertDialogTitle>

            <AlertDialogDescription>
              This will permanently delete this business trip.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingTripId !== null}
            >
              Cancel
            </AlertDialogCancel>

            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                tripToDelete === null ||
                deletingTripId === tripToDelete.id
              }
              onClick={(event) => {
                event.preventDefault();

                if (tripToDelete) {
                  void removeTrip(tripToDelete);
                }
              }}
            >
              {tripToDelete &&
              deletingTripId === tripToDelete.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete Trip"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
