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
    // Forced themes use the installed photographic catalogue.
    // Seasonal/themed backgrounds for different times of year.
    
    if (scene.phase === "night") {
      // Night themes - wall light on
      if (scene.theme === "winter" || scene.theme === "christmas") {
        return connected
          ? "/home-scenes/dashboard-winter-night-charging.png"
          : "/home-scenes/dashboard-winter-night.png";
      }
      if (scene.theme === "halloween") {
        return "/home-scenes/dashboard-halloween-night-light-on.png";
      }
      // Default night
      return "/home-scenes/dashboard-reference-night-light-on.png";
    }

    if (scene.phase === "dawn" || scene.phase === "sunset") {
      if (scene.theme === "winter" || scene.theme === "christmas") {
        return connected
          ? "/home-scenes/dashboard-winter-sunset-charging.png"
          : "/home-scenes/dashboard-winter-sunset.png";
      }
      if (scene.theme === "halloween") {
        return connected
          ? "/home-scenes/dashboard-halloween-sunset-charging.png"
          : "/home-scenes/dashboard-halloween-sunset.png";
      }
      if (scene.theme === "easter") {
        return connected
          ? "/home-scenes/dashboard-easter-sunset-charging.png"
          : "/home-scenes/dashboard-easter-sunset.png";
      }
      return "/home-scenes/dashboard-reference-sunset-charging.png";
    }

    // Daytime themes
    if (scene.theme === "winter" || scene.theme === "christmas") {
      return connected
        ? "/home-scenes/dashboard-winter-day-charging.png"
        : "/home-scenes/dashboard-winter-day.png";
    }

    if (scene.theme === "autumn") {
      return connected
        ? "/home-scenes/dashboard-autumn-day-charging.png"
        : "/home-scenes/dashboard-autumn-day.png";
    }

    if (scene.theme === "halloween") {
      return connected
        ? "/home-scenes/dashboard-halloween-day-charging.png"
        : "/home-scenes/dashboard-halloween-day.png";
    }

    if (scene.theme === "easter") {
      return connected
        ? "/home-scenes/dashboard-easter-day-charging.png"
        : "/home-scenes/dashboard-easter-day.png";
    }

    if (scene.theme === "classic") {
      return connected
        ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
        : "/home-scenes/dashboard-reference-overcast-day.png";
    }

    // Fallback for any unrecognized theme
    return connected
      ? "/home-scenes/dashboard-reference-partly-cloudy-day-charging.png"
      : "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  // Weather-based automatic mode
  // Every supported daytime weather state uses the modern driveway composition.
  if (scene.phase === "day") {
    if (scene.weather === "rain" || scene.weather === "storm") {
      return connected
        ? "/home-scenes/dashboard-reference-rain-day-connected.png"
        : "/home-scenes/dashboard-reference-rain-day-unplugged.png";
    }

    if (
      scene.weather === "overcast" ||
      scene.weather === "mostly-cloudy" ||
      scene.weather === "fog"
    ) {
      return connected
        ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
        : "/home-scenes/dashboard-reference-overcast-day.png";
    }

    if (scene.weather === "snow") {
      return connected
        ? "/home-scenes/dashboard-winter-day-charging.png"
        : "/home-scenes/dashboard-winter-day.png";
    }

    return connected
      ? "/home-scenes/dashboard-reference-partly-cloudy-day-charging.png"
      : "/home-scenes/dashboard-reference-partly-cloudy-day.png";
  }

  if (scene.phase === "night") {
    // Genuine night photograph with exterior wall light on
    // Use winter night if snow is in the weather
    if (scene.weather === "snow") {
      return connected
        ? "/home-scenes/dashboard-winter-night-charging.png"
        : "/home-scenes/dashboard-winter-night.png";
    }
    return "/home-scenes/dashboard-reference-night-light-on.png";
  }

  if (scene.phase === "dawn" || scene.phase === "sunset") {
    if (scene.weather === "snow") {
      return connected
        ? "/home-scenes/dashboard-winter-sunset-charging.png"
        : "/home-scenes/dashboard-winter-sunset.png";
    }
    return "/home-scenes/dashboard-reference-sunset-charging.png";
  }

  // Fallback
  return connected
    ? "/home-scenes/dashboard-reference-overcast-day-charging.png"
    : "/home-scenes/dashboard-reference-overcast-day.png";
}

export function homeCarAsset(): string {
  return "/home-scenes/model-y-quicksilver.png";
}
