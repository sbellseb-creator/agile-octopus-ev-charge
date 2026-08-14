import {
  BatteryCharging,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";

import type { HomeScene } from "@/lib/home-scene";
import { homeSceneBackground } from "@/lib/home-scene-assets";

interface Props {
  scene: HomeScene;
  charging: boolean;
  pluggedIn?: boolean;
  batteryLevel?: number | null;
  chargeLimit?: number | null;
  chargerPowerKw?: number | null;
  timeToFullChargeHours?: number | null;
  state?: string | null;
}

function WeatherIcon({ scene }: { scene: HomeScene }) {
  if (scene.weather === "snow") {
    return <CloudSnow className="h-4 w-4" />;
  }

  if (
    scene.weather === "rain" ||
    scene.weather === "storm"
  ) {
    return <CloudRain className="h-4 w-4" />;
  }

  if (scene.phase === "night") {
    return <Moon className="h-4 w-4" />;
  }

  if (scene.weather === "clear") {
    return <Sun className="h-4 w-4" />;
  }

  return <CloudSun className="h-4 w-4" />;
}

export default function HomeHeroScene({
  scene,
  charging,
  pluggedIn = false,
  batteryLevel,
  chargeLimit,
  chargerPowerKw,
  timeToFullChargeHours,
  state,
}: Props) {
  const battery =
    batteryLevel != null
      ? `${Math.round(batteryLevel)}%`
      : "—";

  const remaining =
    timeToFullChargeHours != null &&
    Number.isFinite(timeToFullChargeHours) &&
    timeToFullChargeHours > 0
      ? (() => {
          const totalMinutes = Math.max(
            1,
            Math.round(timeToFullChargeHours * 60),
          );
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;

          if (hours === 0) return `${minutes} min remaining`;
          if (minutes === 0) return `${hours} hr remaining`;
          return `${hours} hr ${minutes} min remaining`;
        })()
      : null;

  const background = homeSceneBackground(scene, {
    charging,
    pluggedIn,
  });

  return (
    <div className="relative aspect-[4/3] min-h-[300px] overflow-hidden rounded-[22px] bg-slate-950 min-[430px]:aspect-[16/11] sm:aspect-[16/9] sm:min-h-[380px] sm:rounded-[30px] lg:aspect-[16/7] lg:min-h-[500px] lg:max-h-[560px]">

      {/* Real/generated weather scene */}
      <div
        className="absolute inset-0 bg-cover bg-[42%_center] transition-all duration-700 sm:bg-center"
        style={{
          backgroundImage: `url("${background}")`,
        }}
      />

      {/* Fallback atmosphere while an image is unavailable */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 -z-10" />

      {/* Premium cinematic grading */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-black/15" />

      {/* Top status */}
      <div className="absolute left-3 top-3 z-30 max-w-[52%] rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 shadow-2xl backdrop-blur-xl sm:left-4 sm:top-4 sm:max-w-[42%] sm:rounded-2xl sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <BatteryCharging
            className={
              charging
                ? "h-5 w-5 text-emerald-300"
                : "h-5 w-5 text-white/80"
            }
          />

          <span className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            {battery}
          </span>
        </div>

        <div className="mt-1 text-xs font-semibold text-white/85">
          {charging
            ? `${chargerPowerKw != null
                ? `${chargerPowerKw.toFixed(1)} kW · `
                : ""
              }Charging`
            : state || "Last known status"}
        </div>

        {charging && remaining && (
          <div className="mt-1 text-[11px] font-semibold text-emerald-200">
            {remaining}
          </div>
        )}

        {chargeLimit != null && (
          <div className="mt-1 text-[10px] text-white/65">
            Target {Math.round(chargeLimit)}%
          </div>
        )}
      </div>

      {/* Weather badge */}
      <div className="absolute right-3 top-3 z-30 flex max-w-[45%] items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/65 px-2.5 py-2 text-[11px] text-white/85 shadow-xl backdrop-blur-xl sm:right-4 sm:top-4 sm:gap-2 sm:px-3 sm:text-xs">
        <WeatherIcon scene={scene} />

        <span className="capitalize">
          {scene.mode === "forced"
            ? `${scene.theme} · ${scene.weather.replace("-", " ")}`
            : scene.weather.replace("-", " ")}
        </span>

        {scene.temperatureC != null && (
          <span className="font-bold">
            {Math.round(scene.temperatureC)}°
          </span>
        )}
      </div>

      {/* Exterior wall light: only visible when scene is dark */}
      {(scene.phase === "night" || scene.phase === "sunset") && (
        <div className="pointer-events-none absolute left-[23.2%] top-[22%] z-10 h-[110px] w-[85px] rounded-full bg-amber-200/12 blur-2xl" />
      )}

      {charging && (
        <div className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/30 bg-emerald-950/75 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-emerald-100 shadow-[0_0_22px_rgba(52,211,153,.28)] backdrop-blur-xl sm:bottom-4 sm:px-5 sm:py-2 sm:text-xs sm:tracking-[0.13em] lg:bottom-auto lg:left-4 lg:top-[112px] lg:translate-x-0">
          ⚡ LIVE CHARGING
        </div>
      )}

      {!charging && pluggedIn && (
        <div className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-300/25 bg-slate-950/75 px-3 py-1.5 text-[10px] font-black tracking-[0.12em] text-cyan-100 shadow-xl backdrop-blur-xl sm:bottom-4 sm:px-5 sm:py-2 sm:text-xs lg:bottom-auto lg:left-4 lg:top-[112px] lg:translate-x-0">
          PLUGGED IN · WAITING
        </div>
      )}

      {/* Forced theme sparkle */}
      {scene.mode === "forced" && (
        <Sparkles className="absolute bottom-5 left-5 z-30 h-5 w-5 text-white/70" />
      )}
    </div>
  );
}
