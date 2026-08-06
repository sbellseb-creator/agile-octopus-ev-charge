import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/tesla";

export interface WorkTrip {
  id: string;
  user_id: string;
  vehicle_id: string;
  title: string;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
  start_odometer_miles: number;
  end_odometer_miles: number | null;
  distance_miles: number | null;
  created_at: string;
  updated_at: string;
}

async function getSignedInUserId(): Promise<string> {
  const {
    data: { session: existingSession },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(
      `Work Mileage authentication failed: ${sessionError.message}`,
    );
  }

  if (existingSession?.user?.id) {
    return existingSession.user.id;
  }

  const {
    data: signInData,
    error: signInError,
  } = await supabase.auth.signInAnonymously();

  if (signInError) {
    throw new Error(
      `Work Mileage authentication failed: ${signInError.message}`,
    );
  }

  if (!signInData.session?.user?.id) {
    throw new Error(
      "Work Mileage authentication session is missing.",
    );
  }

  const {
    data: { session: confirmedSession },
    error: confirmError,
  } = await supabase.auth.getSession();

  if (confirmError) {
    throw new Error(
      `Work Mileage authentication failed: ${confirmError.message}`,
    );
  }

  if (!confirmedSession?.user?.id) {
    throw new Error(
      "Work Mileage authentication session could not be confirmed.",
    );
  }

  return confirmedSession.user.id;
}

export async function getCurrentOdometer(
  vin: string,
  wake = false,
): Promise<number> {
  const { data, error } = await supabase.functions.invoke(
    "tesla-odometer",
    {
      body: {
        device_id: getDeviceId(),
        vin,
        wake,
      },
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const odometer = Number(data?.odometer_miles);

  if (!Number.isFinite(odometer)) {
    throw new Error(
      "Tesla did not return a valid odometer reading.",
    );
  }

  return odometer;
}

export async function loadActiveTrip(
  vehicleId?: string,
): Promise<WorkTrip | null> {
  const userId = await getSignedInUserId();

  let query = (supabase as any)
    .from("work_trips")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? {
        ...data,
        start_odometer_miles: Number(
          data.start_odometer_miles,
        ),
        end_odometer_miles:
          data.end_odometer_miles == null
            ? null
            : Number(data.end_odometer_miles),
        distance_miles:
          data.distance_miles == null
            ? null
            : Number(data.distance_miles),
      }
    : null;
}

export async function loadRecentTrips(
  vehicleId?: string,
  limit = 5,
): Promise<WorkTrip[]> {
  const userId = await getSignedInUserId();

  let query = (supabase as any)
    .from("work_trips")
    .select("*")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((trip: any) => ({
    ...trip,
    start_odometer_miles: Number(
      trip.start_odometer_miles,
    ),
    end_odometer_miles:
      trip.end_odometer_miles == null
        ? null
        : Number(trip.end_odometer_miles),
    distance_miles:
      trip.distance_miles == null
        ? null
        : Number(trip.distance_miles),
  })) as WorkTrip[];
}

export async function startWorkTrip(args: {
  vehicleId: string;
  vin: string;
  title?: string;
}): Promise<WorkTrip> {
  const userId = await getSignedInUserId();

  const existing = await loadActiveTrip(args.vehicleId);

  if (existing) {
    throw new Error(
      "A work trip is already active for this vehicle.",
    );
  }

  const odometer = await getCurrentOdometer(args.vin);

  const { data, error } = await (supabase as any)
    .from("work_trips")
    .insert({
      user_id: userId,
      vehicle_id: args.vehicleId,
      title: args.title?.trim() || "Work Trip",
      started_at: new Date().toISOString(),
      start_odometer_miles: odometer,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    start_odometer_miles: Number(
      data.start_odometer_miles,
    ),
    end_odometer_miles: null,
    distance_miles: null,
  };
}

export async function endWorkTrip(args: {
  trip: WorkTrip;
  vin: string;
}): Promise<WorkTrip> {
  const userId = await getSignedInUserId();
  const endOdometer = await getCurrentOdometer(args.vin);

  const preciseDistance = Math.max(
    0,
    endOdometer - args.trip.start_odometer_miles,
  );

  const { data, error } = await (supabase as any)
    .from("work_trips")
    .update({
      ended_at: new Date().toISOString(),
      end_odometer_miles: endOdometer,
      distance_miles: preciseDistance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.trip.id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...data,
    start_odometer_miles: Number(
      data.start_odometer_miles,
    ),
    end_odometer_miles: Number(
      data.end_odometer_miles,
    ),
    distance_miles: Number(data.distance_miles),
  };
}

export function displayMiles(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return `${Math.round(value).toLocaleString()} mi`;
}

export function formatTripDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
