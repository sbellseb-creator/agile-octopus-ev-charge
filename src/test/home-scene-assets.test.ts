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
  it("reuses the photographic daytime driveway for each seasonal theme (overlay adds the seasonal effect)", () => {
    expect(homeSceneBackground(baseScene({ theme: "winter", phase: "day" }))).toBe(
      "/home-scenes/dashboard-reference-partly-cloudy-day.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "easter", phase: "day" }))).toBe(
      "/home-scenes/dashboard-reference-partly-cloudy-day.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "halloween", phase: "day" }))).toBe(
      "/home-scenes/dashboard-reference-partly-cloudy-day.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "christmas", phase: "day" }))).toBe(
      "/home-scenes/dashboard-reference-partly-cloudy-day.png",
    );
  });

  it("reuses the photographic night driveway for each seasonal theme (overlay adds the seasonal effect)", () => {
    expect(homeSceneBackground(baseScene({ theme: "winter", phase: "night" }))).toBe(
      "/home-scenes/dashboard-reference-night-light-on.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "easter", phase: "night" }))).toBe(
      "/home-scenes/dashboard-reference-night-light-on.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "halloween", phase: "night" }))).toBe(
      "/home-scenes/dashboard-reference-night-light-on.png",
    );
    expect(homeSceneBackground(baseScene({ theme: "christmas", phase: "night" }))).toBe(
      "/home-scenes/dashboard-reference-night-light-on.png",
    );
  });

  it("shows the charging driveway photo for each seasonal theme when connected", () => {
    expect(
      homeSceneBackground(baseScene({ theme: "winter", phase: "day" }), { pluggedIn: true }),
    ).toBe("/home-scenes/dashboard-reference-partly-cloudy-day-charging.png");
    expect(
      homeSceneBackground(baseScene({ theme: "easter", phase: "day" }), { charging: true }),
    ).toBe("/home-scenes/dashboard-reference-partly-cloudy-day-charging.png");
    expect(
      homeSceneBackground(baseScene({ theme: "halloween", phase: "day" }), { pluggedIn: true }),
    ).toBe("/home-scenes/dashboard-reference-partly-cloudy-day-charging.png");
    expect(
      homeSceneBackground(baseScene({ theme: "christmas", phase: "day" }), { charging: true }),
    ).toBe("/home-scenes/dashboard-reference-partly-cloudy-day-charging.png");
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
