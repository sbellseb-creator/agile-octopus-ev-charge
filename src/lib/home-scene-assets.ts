import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  _state: {
    pluggedIn?: boolean;
    charging?: boolean;
  } = {},
): string {
  // Always return the standard base background assets featuring your white charger unit.
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
