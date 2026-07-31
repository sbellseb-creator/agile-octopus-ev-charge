import { supabase } from "@/integrations/supabase/client";
import type { TeslaSchedule } from "./teslaScheduler";

export interface TeslaSendResult {
  success: boolean;
  message: string;
}

export async function sendScheduleToTesla(
  schedule: TeslaSchedule
): Promise<TeslaSendResult> {
  const { data, error } = await supabase.functions.invoke(
    "tesla-charge-schedule",
    {
      body: schedule,
    }
  );

  if (error) {
    console.error(error);

    return {
      success: false,
      message: error.message,
    };
  }

  return data as TeslaSendResult;
}