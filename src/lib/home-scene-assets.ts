import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  state: {
    pluggedIn?: boolean;
    charging?: boolean;
  } = {},
): string {
  // We keep this variable if needed for other logic, but we will always 
  // load the clean base background assets featuring your white charger unit.
  const connected = Boolean(state.pluggedIn || state.charging);

  if (scene.mode === "forced") {
    const isNight = scene.phase === "night";

    if (isNight) {
      return "/home-scenes/dashboard-reference-night-light-on.png";
    }

    if (scene.phase === "dawn" || scene.phase === "sunset") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    if (scene.theme === "classic") {
      return "/home-scenes/dashboard-reference-overcast-day.png";
    }

    if (scene.theme === "autumn") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    if (
      scene.theme === "winter" ||
      scene.theme === "easter" ||
      scene.theme === "halloween" ||
      scene.theme === "christmas"
    ) {
      return "/home-scenes/dashboard-reference-partly-cloudy-day.png";
    }

    return "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  if (scene.phase === "day") {
    if (scene.weather === "rain" || scene.weather === "storm") {
      return "/home-scenes/dashboard-reference-rain-day-unplugged.png";
    }

    if (
      scene.weather === "overcast" ||
      scene.weather === "mostly-cloudy" ||
      scene.weather === "fog" ||
      scene.weather === "snow"
    ) {
      return "/home-scenes/dashboard-reference-overcast-day.png";
    }

    return "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  if (scene.phase === "night") {
    return "/home-scenes/dashboard-reference-night-light-on.png";
  }

  if (scene.phase === "dawn" || scene.phase === "sunset") {
    return "/home-scenes/dashboard-reference-sunset-charging.png";
  }

  return "/home-scenes/dashboard-reference-overcast-day.png";
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
