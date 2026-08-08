import type { HomeThemePreference } from "@/lib/app-settings";

export type WeatherScene =
  | "clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "rain"
  | "storm"
  | "snow";

export type DayPhase =
  | "dawn"
  | "day"
  | "sunset"
  | "night";

export interface HomeScene {
  mode: "weather" | "forced";
  theme: HomeThemePreference;
  weather: WeatherScene;
  phase: DayPhase;
  weatherCode?: number;
  temperatureC?: number;
  source?: "live" | "estimated";
}

export function weatherCodeToScene(code: number): WeatherScene {
  if (code === 0) return "clear";

  if (code === 1 || code === 2) {
    return "partly-cloudy";
  }

  if (code === 3) {
    return "overcast";
  }

  if (code === 45 || code === 48) {
    return "fog";
  }

  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) {
    return "rain";
  }

  if (
    (code >= 71 && code <= 77) ||
    code === 85 ||
    code === 86
  ) {
    return "snow";
  }

  if (code >= 95 && code <= 99) {
    return "storm";
  }

  return "overcast";
}

export function getUKDayPhase(date = new Date()): DayPhase {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value ?? 12,
  );

  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 18) return "day";
  if (hour >= 18 && hour < 21) return "sunset";
  return "night";
}

export function resolveHomeScene(args: {
  preference: HomeThemePreference;
  weatherCode?: number;
  temperatureC?: number;
  source?: "live" | "estimated";
  now?: Date;
}): HomeScene {
  const phase = getUKDayPhase(args.now);

  if (args.preference !== "automatic") {
    return {
      mode: "forced",
      theme: args.preference,
      weather:
        args.preference === "winter" ||
        args.preference === "christmas"
          ? "snow"
          : "clear",
      phase,
      weatherCode: args.weatherCode,
      temperatureC: args.temperatureC,
      source: args.source,
    };
  }

  return {
    mode: "weather",
    theme: "automatic",
    weather: weatherCodeToScene(args.weatherCode ?? 3),
    phase,
    weatherCode: args.weatherCode,
    temperatureC: args.temperatureC,
    source: args.source,
  };
}
