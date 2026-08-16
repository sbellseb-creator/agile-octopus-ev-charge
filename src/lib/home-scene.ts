import type { HomeThemePreference } from "@/lib/app-settings";

export type WeatherScene =
  | "clear"
  | "fair"
  | "partly-cloudy"
  | "mostly-cloudy"
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
  cloudCover?: number;
  source?: "live" | "estimated";
  sunrise?: string;
  sunset?: string;
}

export function weatherCodeToScene(
  code: number,
  cloudCover?: number,
): WeatherScene {
  if (code === 0) return "clear";

  if (code === 1) return "fair";

  if (code === 2) {
    if (cloudCover != null && cloudCover >= 70) {
      return "mostly-cloudy";
    }
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

export function getUKDayPhase(
  date = new Date(),
  sunrise?: string,
  sunset?: string,
): DayPhase {
  const now = date.getTime();

  if (sunrise && sunset) {
    const sunriseMs = new Date(sunrise).getTime();
    const sunsetMs = new Date(sunset).getTime();

    if (Number.isFinite(sunriseMs) && Number.isFinite(sunsetMs)) {
      const minute = 60_000;

      if (
        now >= sunriseMs - 45 * minute &&
        now < sunriseMs + 30 * minute
      ) {
        return "dawn";
      }

      if (
        now >= sunriseMs + 30 * minute &&
        now < sunsetMs - 45 * minute
      ) {
        return "day";
      }

      if (
        now >= sunsetMs - 45 * minute &&
        now < sunsetMs + 30 * minute
      ) {
        return "sunset";
      }

      return "night";
    }
  }

  // Safe fallback when solar data is unavailable.
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
  cloudCover?: number;
  sunrise?: string;
  sunset?: string;
  source?: "live" | "estimated";
  now?: Date;
}): HomeScene {
  const phase = getUKDayPhase(
    args.now,
    args.sunrise,
    args.sunset,
  );

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
      cloudCover: args.cloudCover,
      sunrise: args.sunrise,
      sunset: args.sunset,
      source: args.source,
    };
  }

  return {
    mode: "weather",
    theme: "automatic",
    weather: weatherCodeToScene(
      args.weatherCode ?? 3,
      args.cloudCover,
    ),
    phase,
    weatherCode: args.weatherCode,
    temperatureC: args.temperatureC,
    cloudCover: args.cloudCover,
    sunrise: args.sunrise,
    sunset: args.sunset,
    source: args.source,
  };
}
