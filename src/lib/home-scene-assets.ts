import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  state: {
    pluggedIn?: boolean;
    charging?: boolean;
  } = {},
): string {
  const connected = Boolean(state.pluggedIn || state.charging);

  if (scene.mode === "forced") {
    return `/home-scenes/theme-${scene.theme}-${scene.phase}.webp`;
  }

  // Every supported daytime weather state stays in the same modern driveway
  // composition. Tesla state changes only the cable/charger treatment; they
  // must never send Home back to the legacy photographic scene.
  if (scene.phase === "day") {
    if (scene.weather === "rain" || scene.weather === "storm") {
      return connected
        ? "/home-scenes/dashboard-reference-rain-day-connected.png"
        : "/home-scenes/dashboard-reference-rain-day-unplugged.png";
    }

    if (
      scene.weather === "overcast" ||
      scene.weather === "mostly-cloudy" ||
      scene.weather === "fog" ||
      scene.weather === "snow"
    ) {
      return connected
        ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
        : "/home-scenes/dashboard-reference-overcast-day.png";
    }

    return connected
      ? "/home-scenes/dashboard-reference-partly-cloudy-day-charging.png"
      : "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  if (
    scene.phase === "sunset" &&
    (scene.weather === "clear" ||
      scene.weather === "fair" ||
      scene.weather === "partly-cloudy") &&
    connected
  ) {
    return "/home-scenes/dashboard-reference-sunset-charging.png";
  }

  const assetWeather =
    scene.weather === "fair"
      ? "partly-cloudy"
      : scene.weather === "mostly-cloudy"
        ? "overcast"
        : scene.weather;

  return `/home-scenes/weather-${assetWeather}-${scene.phase}.webp`;
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
