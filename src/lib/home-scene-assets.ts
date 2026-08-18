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
    // Forced themes use the installed photographic catalogue.  Earlier
    // releases pointed at theme files which did not exist, leaving a blank
    // gradient.  Keep every selector functional until bespoke seasonal
    // photographs are added.
    if (scene.phase === "night") {
      return "/home-scenes/dashboard-reference-night-light-on.png";
    }

    if (scene.phase === "dawn" || scene.phase === "sunset") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    if (scene.theme === "winter" || scene.theme === "classic") {
      return connected
        ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
        : "/home-scenes/dashboard-reference-overcast-day.png";
    }

    if (scene.theme === "autumn" || scene.theme === "halloween") {
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
