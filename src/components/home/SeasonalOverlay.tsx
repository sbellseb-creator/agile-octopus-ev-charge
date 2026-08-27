import type { ReactNode } from "react";

import type { HomeThemePreference } from "@/lib/app-settings";
import type { DayPhase } from "@/lib/home-scene";
import "@/styles/seasonal-themes.css";

interface SeasonalOverlayProps {
  /** Forced theme selection (or "automatic"/other themes, which render no overlay). */
  theme: HomeThemePreference;
  phase: DayPhase;
  /** The photo layer(s) to be colour-graded and overlaid. */
  children: ReactNode;
}

type SeasonalTheme = "winter" | "easter" | "halloween" | "christmas";

const SEASONAL_THEMES: readonly SeasonalTheme[] = [
  "winter",
  "easter",
  "halloween",
  "christmas",
];

function isSeasonalTheme(
  theme: HomeThemePreference,
): theme is SeasonalTheme {
  return (SEASONAL_THEMES as readonly string[]).includes(theme);
}

const SNOWFLAKES = [
  { left: "6%", size: 5, delay: "0s", duration: "8s", drift: 10 },
  { left: "16%", size: 3, delay: "1.4s", duration: "10s", drift: -14 },
  { left: "27%", size: 6, delay: "2.6s", duration: "9s", drift: 8 },
  { left: "38%", size: 4, delay: "0.6s", duration: "11s", drift: -6 },
  { left: "49%", size: 3, delay: "3.2s", duration: "8.5s", drift: 12 },
  { left: "61%", size: 5, delay: "1.9s", duration: "10.5s", drift: -10 },
  { left: "73%", size: 4, delay: "0.2s", duration: "9.5s", drift: 6 },
  { left: "85%", size: 6, delay: "2.4s", duration: "11.5s", drift: -8 },
  { left: "93%", size: 3, delay: "3.8s", duration: "8s", drift: 14 },
] as const;

const BATS = [
  { top: "18%", delay: "0s", duration: "9s", scale: 0.9 },
  { top: "34%", delay: "3.5s", duration: "11s", scale: 0.65 },
  { top: "10%", delay: "6.5s", duration: "8s", scale: 0.75 },
];

function BatSilhouette() {
  return (
    <path
      d="M12 0c-1.4 1.6-1.8 3-1.8 4.4C7.6 2.6 3.4 1.6 0 3c1.8 1.4 3.2 3 3.6 4.8C1.8 8.4 0.4 9.8 0 12c2.6-1 5-1 6.6 0.4C7 14 7.4 15.6 8 17c1-1.8 2-3 4-3.4 2 0.4 3 1.6 4 3.4 0.6-1.4 1-3 2-4.6 1.6-1.4 4-1.4 6.6-0.4-0.4-2.2-1.8-3.6-3.6-4.2 0.4-1.8 1.8-3.4 3.6-4.8-3.4-1.4-7.6-0.4-10.2 1.4C12.4 3 12 1.6 12 0z"
      fill="currentColor"
    />
  );
}

function WinterEffects({ isNight }: { isNight: boolean }) {
  return (
    <>
      <div
        className="seasonal-gradient-winter seasonal-glow-frost absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        data-seasonal-particles="true"
        aria-hidden="true"
      >
        {SNOWFLAKES.map((flake, index) => (
          <span
            key={index}
            className="seasonal-snowflake absolute top-0 rounded-full bg-white/85"
            style={{
              left: flake.left,
              width: flake.size,
              height: flake.size,
              animationDelay: flake.delay,
              animationDuration: flake.duration,
              opacity: isNight ? 0.55 : 0.85,
              filter: "blur(0.3px)",
              // Read by the `seasonal-snow-fall` keyframe (see
              // seasonal-themes.css) so each flake drifts sideways by a
              // different amount instead of a fixed value.
              ["--seasonal-flake-drift" as string]: `${flake.drift}px`,
            }}
          />
        ))}
      </div>
    </>
  );
}

function EasterEffects() {
  return (
    <div
      className="seasonal-gradient-easter seasonal-glow-spring seasonal-flutter absolute inset-0"
      aria-hidden="true"
    />
  );
}

function HalloweenEffects() {
  return (
    <>
      <div
        className="seasonal-gradient-halloween seasonal-glow-spooky absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        data-seasonal-particles="true"
        aria-hidden="true"
      >
        {BATS.map((bat, index) => (
          <svg
            key={index}
            viewBox="0 0 32 20"
            className="seasonal-bat absolute h-4 w-6 text-slate-950/80"
            style={{
              top: bat.top,
              left: "-10%",
              animationDelay: bat.delay,
              animationDuration: bat.duration,
              transform: `scale(${bat.scale})`,
            }}
          >
            <BatSilhouette />
          </svg>
        ))}
      </div>
    </>
  );
}

function ChristmasEffects({ isNight }: { isNight: boolean }) {
  return (
    <>
      <div
        className="seasonal-gradient-christmas seasonal-glow-festive absolute inset-0"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0"
        data-seasonal-particles="true"
        aria-hidden="true"
      >
        {SNOWFLAKES.map((flake, index) => (
          <span
            key={index}
            className="seasonal-snowflake absolute top-0 rounded-full bg-white/85"
            style={{
              left: flake.left,
              width: flake.size,
              height: flake.size,
              animationDelay: flake.delay,
              animationDuration: flake.duration,
              opacity: isNight ? 0.5 : 0.8,
              filter: "blur(0.3px)",
              ["--seasonal-flake-drift" as string]: `${flake.drift}px`,
            }}
          />
        ))}
        {/* Warm festive light shimmer, sparser than the snowfall. */}
        {[0, 1, 2, 3].map((index) => (
          <span
            key={`shimmer-${index}`}
            className="seasonal-shimmer absolute h-1.5 w-1.5 rounded-full"
            style={{
              left: `${18 + index * 22}%`,
              top: `${12 + (index % 2) * 8}%`,
              background: index % 2 === 0 ? "#f87171" : "#4ade80",
              animationDelay: `${index * 0.8}s`,
              animationDuration: "2.4s",
              boxShadow: "0 0 6px currentColor",
            }}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Wraps the driveway photo with seasonal colour grading (CSS `filter`) and
 * an animated SVG/gradient overlay (snow, bats, shimmer, glow). Renders
 * `children` unchanged for the "automatic"/"classic"/other themes so the
 * existing photographic scenes are unaffected.
 */
export default function SeasonalOverlay({
  theme,
  phase,
  children,
}: SeasonalOverlayProps) {
  if (!isSeasonalTheme(theme)) {
    return <>{children}</>;
  }

  const isNight = phase === "night";
  const filterClass = `seasonal-filter-${theme}${isNight ? " seasonal-filter-night" : ""}`;

  return (
    <div className={`absolute inset-0 h-full w-full ${filterClass}`}>
      {children}

      <div
        className={`seasonal-effects pointer-events-none absolute inset-0 ${
          isNight ? "seasonal-effects-night" : ""
        }`}
      >
        {theme === "winter" && <WinterEffects isNight={isNight} />}
        {theme === "easter" && <EasterEffects />}
        {theme === "halloween" && <HalloweenEffects />}
        {theme === "christmas" && <ChristmasEffects isNight={isNight} />}
      </div>
    </div>
  );
}
