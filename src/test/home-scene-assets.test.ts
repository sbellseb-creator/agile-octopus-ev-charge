import { describe, expect, it } from "vitest";
import { homeSceneBackground } from "@/lib/home-scene-assets";
import type { HomeScene } from "@/lib/home-scene";

const baseScene = (overrides: Partial<HomeScene>): HomeScene => ({
  mode: "forced",
  theme: "winter",
  weather: "clear",
  phase: "day",
  ...overrides,
});

describe("homeSceneBackground seasonal themes", () => {
  it("resolves dedicated day artwork for each seasonal theme", () => {
    expect(homeSceneBackground(baseScene({ theme: "winter", phase: "day" }))).toBe(
      "/home-scenes/dashboard-winter-day.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "easter", phase: "day" }))).toBe(
      "/home-scenes/dashboard-easter-day.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "halloween", phase: "day" }))).toBe(
      "/home-scenes/dashboard-halloween-day.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "christmas", phase: "day" }))).toBe(
      "/home-scenes/dashboard-christmas-day.webp",
    );
  });

  it("resolves dedicated night artwork for each seasonal theme", () => {
    expect(homeSceneBackground(baseScene({ theme: "winter", phase: "night" }))).toBe(
      "/home-scenes/dashboard-winter-night.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "easter", phase: "night" }))).toBe(
      "/home-scenes/dashboard-easter-night.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "halloween", phase: "night" }))).toBe(
      "/home-scenes/dashboard-halloween-night.webp",
    );
    expect(homeSceneBackground(baseScene({ theme: "christmas", phase: "night" }))).toBe(
      "/home-scenes/dashboard-christmas-night.webp",
    );
  });

  it("still falls back to the photographic catalogue for other forced themes", () => {
    expect(homeSceneBackground(baseScene({ theme: "classic", phase: "day" }))).toBe(
      "/home-scenes/dashboard-reference-overcast-day.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "classic", phase: "night" }))).toBe(
      "/home-scenes/dashboard-reference-night-light-on.png",
    );
  });
});
