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
  batteryIsLastKnown?: boolean;
  chargeLimit?: number | null;
  chargerPowerKw?: number | null;
  chargerAmps?: number | null;
  chargerAmpsLive?: boolean;
  timeToFullChargeHours?: number | null;
  state?: string | null;
  viewMode?: "driveway" | "cockpit";
  agilePricePence?: number | null;
  cheapestWindowLabel?: string | null;
  scheduleLabel?: string | null;
  footballTeam?: string;
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
  batteryIsLastKnown = false,
  chargeLimit,
  chargerPowerKw,
  chargerAmps,
  chargerAmpsLive = false,
  timeToFullChargeHours,
  state,
  viewMode = "driveway",
  agilePricePence,
  cheapestWindowLabel,
  scheduleLabel,
  footballTeam = "Sunderland",
}: Props) {
  const battery =
    batteryLevel != null
      ? charging && chargeLimit != null
        ? `${Math.round(batteryLevel)}% → ${Math.round(chargeLimit)}%`
        : `${Math.round(batteryLevel)}%`
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

  const usesAlignedConnectedScene =
    (charging || pluggedIn) &&
    scene.mode === "weather" &&
    scene.phase === "day" &&
    (scene.weather === "fair" ||
      scene.weather === "partly-cloudy" ||
      scene.weather === "mostly-cloudy" ||
      scene.weather === "overcast" ||
      scene.weather === "rain" ||
      scene.weather === "storm");

  const compactStatus = charging
    ? "Charging"
    : pluggedIn
      ? "Plugged in · waiting"
      : batteryIsLastKnown
        ? "Last known"
        : state || "Vehicle status";

  const teamMark = footballTeam === "Sunderland"
    ? "SAFC"
    : footballTeam === "Apple"
      ? "🍎"
      : footballTeam === "Lemon"
        ? "🍋"
        : footballTeam === "Paw"
          ? "🐾"
          : footballTeam === "None"
            ? ""
    : footballTeam
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 4)
        .toUpperCase();
  const clubTicker = footballTeam === "Sunderland"
    ? "HA'WAY THE LADS · SUNDERLAND MODE"
    : `${footballTeam.toUpperCase()} · CLUB MODE`;

  if (viewMode === "cockpit") {
    return (
      <div className="relative aspect-[4/3] min-h-[250px] overflow-hidden rounded-[22px] bg-slate-950 min-[430px]:aspect-[16/10] min-[430px]:min-h-[280px] sm:aspect-[16/8.5] sm:min-h-[320px] sm:rounded-[30px] md:min-h-[360px] lg:aspect-[16/7.4] lg:min-h-[480px] lg:max-h-[590px]">
        <svg
          viewBox="0 0 1672 941"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Right-hand-drive Model Y cockpit with EV Charge Tracker information on the centre screen"
        >
          <image
            href="/home-scenes/cockpit-model-y-rhd-v1.webp"
            width="1672"
            height="941"
            preserveAspectRatio="xMidYMid slice"
          />
          {/* A playful selectable mirror air freshener, kept separate from the
              information display so the HMI remains readable. */}
          {footballTeam !== "None" && <>
          <line x1="836" y1="0" x2="836" y2="190" stroke="rgba(15,23,42,.85)" strokeWidth="4" />
          <g transform="translate(786 176)">
            <path d="M50 0 C75 0 94 19 94 44 C94 71 75 96 50 112 C25 96 6 71 6 44 C6 19 25 0 50 0Z" fill={footballTeam === "Sunderland" ? "#dc2626" : "#0f766e"} stroke="white" strokeWidth="4" />
            <text x="50" y="52" textAnchor="middle" fill="white" fontSize="22" fontWeight="900">{teamMark}</text>
            <text x="50" y="75" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">AIR FRESHENER</text>
          </g>
          </>}
          <foreignObject x="686" y="326" width="378" height="246">
            <div className="flex h-full w-full flex-col overflow-hidden rounded-[13px] border border-emerald-300/20 bg-[#071018] px-4 py-3 text-white shadow-[inset_0_0_28px_rgba(16,185,129,.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">EV Charge Tracker</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-[34px] font-black leading-none">{batteryLevel != null ? `${Math.round(batteryLevel)}%` : "—"}</span>
                    {batteryIsLastKnown && <span className="text-[9px] font-bold uppercase text-slate-400">last known</span>}
                  </div>
                  <p className={`mt-1 text-[11px] font-bold ${charging ? "text-emerald-300" : pluggedIn ? "text-cyan-300" : "text-slate-300"}`}>
                    {compactStatus}
                  </p>
                </div>
                <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[8px] font-bold text-emerald-200">READ ONLY</div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                <div className="rounded-lg bg-white/[.06] p-2">
                  <p className="uppercase tracking-wider text-slate-400">Agile now</p>
                  <p className="mt-0.5 text-[15px] font-black text-white">{agilePricePence != null ? `${agilePricePence.toFixed(2)}p` : "Loading"}</p>
                </div>
                <div className="rounded-lg bg-white/[.06] p-2">
                  <p className="uppercase tracking-wider text-slate-400">Schedule</p>
                  <p className="mt-0.5 truncate text-[13px] font-black text-white">{scheduleLabel || (pluggedIn ? "Ready when cheap" : "Not scheduled")}</p>
                </div>
              </div>

              <div className="mt-2 flex min-h-0 flex-1 items-center justify-between gap-2 rounded-lg border border-emerald-300/15 bg-emerald-400/[.06] px-2.5">
                <div className="min-w-0">
                  <p className="text-[8px] uppercase tracking-wider text-emerald-300">Best charging opportunity</p>
                  <p className="truncate text-[11px] font-bold">{cheapestWindowLabel || "Waiting for Agile prices"}</p>
                </div>
                {remaining && <p className="shrink-0 text-[9px] font-bold text-emerald-200">{remaining.replace(" remaining", "")}</p>}
              </div>
              <div className="mt-1.5 overflow-hidden whitespace-nowrap border-t border-white/10 pt-1 text-[7px] font-black tracking-[0.16em] text-red-300">
                <span className="inline-block animate-pulse">{clubTicker}</span>
                <span className="mx-3 text-slate-600">•</span>
                <span className="text-slate-400">Live club news source coming later</span>
              </div>
            </div>
          </foreignObject>
        </svg>

        <div className="absolute bottom-2 left-2 z-30 rounded-full border border-white/15 bg-slate-950/65 px-2.5 py-1 text-[9px] text-slate-300 backdrop-blur-xl sm:bottom-3 sm:left-3 sm:text-[10px]">
          Cockpit · read only · never wakes the car
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/3] min-h-[250px] overflow-hidden rounded-[22px] bg-slate-950 min-[430px]:aspect-[16/10] min-[430px]:min-h-[280px] sm:aspect-[16/8.5] sm:min-h-[320px] sm:rounded-[30px] md:min-h-[360px] lg:aspect-[16/7.4] lg:min-h-[480px] lg:max-h-[590px]">

      {/* Real/generated weather scene */}
      {usesAlignedConnectedScene ? (
        <svg
          viewBox="0 0 1672 941"
          preserveAspectRatio="xMaxYMid slice"
          className="absolute inset-0 h-full w-full transition-all duration-700"
          aria-hidden="true"
        >
          <defs>
            <filter id="live-cable-line-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation=".55" result="cableGlow" />
              <feMerge>
                <feMergeNode in="cableGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <image
            href={background}
            x="0"
            y="0"
            width="1672"
            height="941"
            preserveAspectRatio="xMidYMid slice"
          />
          <path
            d="M526 382 C526 445 525 520 526 568 C527 615 563 638 626 649 C720 666 844 680 934 678 C981 677 1010 655 1024 623 C1040 588 1045 530 1052 487 C1058 456 1065 446 1078 445"
            fill="none"
            stroke={charging ? "rgb(68 255 164)" : "rgb(55 170 255)"}
            strokeWidth={charging ? "2.4" : "2.7"}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#live-cable-line-glow)"
            opacity={charging ? ".22" : ".88"}
          >
            {charging && (
              <animate
                attributeName="opacity"
                values=".22;.82;.22"
                dur="2.2s"
                repeatCount="indefinite"
              />
            )}
          </path>
        </svg>
      ) : (
        <div
          className="absolute inset-0 bg-cover bg-[42%_center] transition-all duration-700 sm:bg-center"
          style={{
            backgroundImage: `url("${background}")`,
          }}
        />
      )}

      {/* Fallback atmosphere while an image is unavailable */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 -z-10" />

      {/* Premium cinematic grading */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-black/15" />

      {/* Top status */}
      <div className="absolute left-2 top-2 z-30 max-w-[62%] rounded-xl border border-white/15 bg-slate-950/70 px-2.5 py-2 shadow-2xl backdrop-blur-xl min-[430px]:left-3 min-[430px]:top-3 min-[430px]:max-w-[52%] min-[430px]:px-3 sm:left-4 sm:top-4 sm:max-w-[38%] sm:rounded-2xl sm:px-3 sm:py-2.5 md:max-w-[42%] md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <BatteryCharging
            className={
              charging
                ? "h-4 w-4 text-emerald-300 sm:h-5 sm:w-5"
                : "h-4 w-4 text-white/80 sm:h-5 sm:w-5"
            }
          />

          <span className="text-lg font-black tracking-tight text-white min-[430px]:text-xl md:text-2xl">
            {battery}
          </span>
        </div>

        <div className="mt-1 text-[11px] font-semibold text-white/85 min-[430px]:text-xs">
          {charging
            ? `${chargerPowerKw != null
                ? `${chargerPowerKw.toFixed(1)} kW${
                    chargerAmps != null
                      ? ` · ${Math.round(chargerAmps)} A ${
                          chargerAmpsLive ? "live" : "max"
                        }`
                      : ""
                  } · `
                : ""
              }Charging`
            : `${state || "Vehicle status"}${batteryIsLastKnown && !state?.toLowerCase().includes("last known") ? " · Last known" : ""}`}
        </div>

        {charging && remaining && (
          <div className="mt-1 text-[11px] font-semibold text-emerald-200">
            {remaining}
          </div>
        )}

        {!charging && chargeLimit != null && (
          <div className="mt-1 text-[10px] text-white/65">
            Target {Math.round(chargeLimit)}%
          </div>
        )}
      </div>

      {/* Weather badge */}
      <div className="absolute right-2 top-2 z-30 flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/65 px-2 py-1.5 text-[10px] text-white/85 shadow-xl backdrop-blur-xl min-[430px]:right-3 min-[430px]:top-3 min-[430px]:px-2.5 min-[430px]:py-2 min-[430px]:text-[11px] sm:right-4 sm:top-4 sm:gap-2 sm:text-xs md:px-3">
        <WeatherIcon scene={scene} />

        <span className="hidden capitalize min-[430px]:inline">
          {scene.mode === "forced"
            ? `${scene.theme} · ${scene.weather.split("-").join(" ")}`
            : scene.weather.split("-").join(" ")}
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
