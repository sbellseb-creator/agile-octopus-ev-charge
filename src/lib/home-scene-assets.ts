import type { HomeScene } from "@/lib/home-scene";

export function homeSceneBackground(scene: HomeScene): string {
  if (scene.mode === "forced") {
    return `/home-scenes/theme-${scene.theme}-${scene.phase}.webp`;
  }

  return `/home-scenes/weather-${scene.weather}-${scene.phase}.webp`;
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
