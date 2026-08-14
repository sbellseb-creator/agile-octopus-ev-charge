import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(
  scene: HomeScene,
  state?: { charging?: boolean; pluggedIn?: boolean },
): string {
  if (scene.mode === "forced") {
    return `/home-scenes/theme-${scene.theme}-${scene.phase}.webp`;
  }

  if (
    scene.phase === "day" &&
    scene.weather === "partly-cloudy" &&
    !state?.pluggedIn &&
    !state?.charging
  ) {
    return "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  if (
    scene.phase === "sunset" &&
    (scene.weather === "clear" ||
      scene.weather === "partly-cloudy") &&
    state?.charging
  ) {
    return "/home-scenes/dashboard-reference-sunset-charging.png";
  }

  return `/home-scenes/weather-${scene.weather}-${scene.phase}.webp`;
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
