import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  _state: {
    pluggedIn?: boolean;
    charging?: boolean;
  } = {},
): string {
  if (scene.mode === "forced") {
    const isNight = scene.phase === "night";

    if (isNight) {
      return "/home-scenes/dashboard-reference-night-light-on.png";
    }

    if (scene.phase === "dawn" || scene.phase === "sunset") {
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    return "/home-scenes/dashboard-reference-overcast-day.png";
  }

  if (scene.phase === "day") {
    if (scene.weather === "rain" || scene.weather === "storm") {
      return _state.pluggedIn
        ? "/home-scenes/dashboard-reference-rain-day-connected.png"
        : "/home-scenes/dashboard-reference-rain-day-unplugged.png";
    }
    return "/home-scenes/dashboard-reference-overcast-day.png";
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
