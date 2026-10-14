import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  state: {
    pluggedIn?: boolean;
    charging?: boolean;
  } = {},
): string {
  const isChargingOrPlugged = state.charging || state.pluggedIn;
  const isNight = scene.phase === "night";
  const isRain = scene.weather === "rain" || scene.weather === "storm";

  if (scene.mode === "forced") {
    if (isNight) {
      return isChargingOrPlugged
        ? "/home-scenes/dashboard-reference-night-light-on.png"
        : "/home-scenes/weather-clear-night.webp";
    }
    return isChargingOrPlugged
      ? "/home-scenes/dashboard-reference-sunset-charging.png"
      : "/home-scenes/dashboard-reference-overcast-day.png";
  }

  // Handle weather-specific overrides like rain
  if (isRain) {
    return isNight
      ? "/home-scenes/weather-rain-night.webp"
      : "/home-scenes/weather-rain-day.webp";
  }

  if (scene.phase === "day") {
    return "/home-scenes/dashboard-reference-overcast-day.png";
  }

  if (isNight) {
    return isChargingOrPlugged
      ? "/home-scenes/dashboard-reference-night-light-on.png"
      : "/home-scenes/weather-clear-night.webp";
  }

  if (scene.phase === "dawn" || scene.phase === "sunset") {
    return isChargingOrPlugged
      ? "/home-scenes/dashboard-reference-sunset-charging.png"
      : "/home-scenes/weather-clear-dawn.webp";
  }

  return "/home-scenes/dashboard-reference-overcast-day.png";
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
