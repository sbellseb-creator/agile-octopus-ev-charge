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
    // Seasonal themes have their own dedicated day/night artwork. Fall back
    // to the photographic catalogue for themes without bespoke seasonal
    // artwork so every selector stays functional.
    const isNight = scene.phase === "night";

    if (
      scene.theme === "winter" ||
      scene.theme === "easter" ||
      scene.theme === "halloween" ||
      scene.theme === "christmas"
    ) {
      return `/home-scenes/dashboard-${scene.theme}-${isNight ? "night" : "day"}.webp`;
    }

    if (isNight) {
      return "/home-scenes/dashboard-reference-night-light-on.png";
    }

    if (scene.phase === "dawn" || scene.phase === "sunset") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    if (scene.theme === "classic") {
      return connected
        ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
        : "/home-scenes/dashboard-reference-overcast-day.png";
    }

    if (scene.theme === "autumn") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    return connected
      ? "/home-scenes/dashboard-reference-partly-cloudy-day-charging.png"
      : "/home-scenes/dashboard-reference-partly-cloudy-day.png";
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

  if (scene.phase === "night") {
    // This is a genuine night photograph with the exterior wall light on,
    // not a daytime image darkened with CSS.
    return "/home-scenes/dashboard-reference-night-light-on.png";
  }

  if (scene.phase === "dawn" || scene.phase === "sunset") {
    return "/home-scenes/dashboard-reference-sunset-charging.png";
  }

  return connected
    ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
    : "/home-scenes/dashboard-reference-overcast-day.png";
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
