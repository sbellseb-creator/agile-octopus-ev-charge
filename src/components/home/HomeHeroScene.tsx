import { useEffect, useRef } from "react";
import {
  BatteryCharging,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";

import SeasonalOverlay from "@/components/home/SeasonalOverlay";
import type { HomeScene } from "@/lib/home-scene";
import { homeSceneBackground } from "@/lib/home-scene-assets";
import { calculateChargeFromPower } from "@/lib/tesla-charge-calc";

interface Props {
  scene: HomeScene;
  charging: boolean;
  pluggedIn?: boolean;
  batteryLevel?: number | null;
  batteryIsLastKnown?: boolean;
  batteryCapacityKwh?: number | null;
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
  batteryCapacityKwh,
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

  const observedRemainingHours =
    charging &&
    batteryLevel != null &&
    chargeLimit != null &&
    batteryCapacityKwh != null &&
    chargerPowerKw != null &&
    Number.isFinite(chargerPowerKw) &&
    chargerPowerKw > 0
      ? calculateChargeFromPower(
          batteryLevel,
          chargeLimit,
          batteryCapacityKwh,
          chargerPowerKw,
        ).estimatedHours
      : timeToFullChargeHours;

  const remaining =
    observedRemainingHours != null &&
    Number.isFinite(observedRemainingHours) &&
    observedRemainingHours > 0
      ? (() => {
          const totalMinutes = Math.max(
            1,
            Math.round(observedRemainingHours * 60),
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

  const backgroundLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    console.log("[HomeHeroScene] scene:", scene);
    console.log("[HomeHeroScene] homeSceneBackground() ->", background);
    console.log("[HomeHeroScene] background style ->", `url("${background}")`);
    console.log(
      "[HomeHeroScene] rendered backgroundImage style ->",
      backgroundLayerRef.current?.style.backgroundImage,
    );
  }, [scene, background]);

  const usesAlignedConnectedScene =
    (charging || pluggedIn) &&
    scene.phase === "day" &&
    (scene.mode !== "forced" || scene.theme !== "autumn");

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
      <div className="relative aspect-[16/9] min-h-[190px] overflow-hidden rounded-[22px] bg-slate-950 min-[430px]:aspect-[16/10] min-[430px]:min-h-[280px] sm:aspect-[16/8.5] sm:min-h-[320px] sm:rounded-[30px] md:min-h-[360px] lg:aspect-[16/7.4] lg:min-h-[480px] lg:max-h-[590px]">
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
          {footballTeam !== "None" && <>
          <g filter="drop-shadow(0 7px 8px rgba(0,0,0,.65))">
            <rect x="760" y="74" width="152" height="46" rx="18" fill="#111827" stroke="#475569" strokeWidth="4" />
            <rect x="775" y="84" width="122" height="22" rx="10" fill="#020617" />
          </g>
          <line x1="836" y1="120" x2="836" y2="194" stroke="#111827" strokeWidth="4" />
          <g transform="translate(796 188)" filter="drop-shadow(0 7px 7px rgba(0,0,0,.55))">
            <path d="M40 0 L55 23 L70 24 L61 42 L76 67 L57 64 L50 91 L40 80 L30 91 L23 64 L4 67 L19 42 L10 24 L25 23 Z" fill={footballTeam === "Sunderland" ? "#dc2626" : "#0f766e"} stroke="white" strokeWidth="3" />
            <text x="40" y="51" textAnchor="middle" fill="white" fontSize="17" fontWeight="900">{teamMark}</text>
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
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    );
  }

  return (
    <div className="relative aspect-[16/10] min-h-[190px] overflow-hidden rounded-[22px] bg-slate-950 border border-white/5 min-[430px]:aspect-[16/10] min-[430px]:min-h-[260px] sm:aspect-[16/9] sm:min-h-[320px] sm:rounded-[30px] md:min-h-[360px] lg:aspect-[16/7.4] lg:min-h-[480px] lg:max-h-[590px] shadow-2xl transition-all duration-500">
      <div
        ref={backgroundLayerRef}
        style={{ backgroundImage: `url("${background}")` }}
        className="absolute inset-0 h-full w-full bg-cover bg-center transition-all duration-700 brightness-[0.88]"
      />

      <SeasonalOverlay scene={scene} opacity={0.65} />

      {footballTeam !== "None" && (
        <div className="absolute top-3 left-3 z-10 hidden items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/45 px-2.5 py-1 backdrop-blur-md transition-all duration-300 sm:flex max-w-[210px] overflow-hidden">
          <Sparkles className={`h-3 w-3 shrink-0 ${footballTeam === "Sunderland" ? "text-red-400 animate-pulse" : "text-teal-400"}`} />
          <div className="w-[180px] overflow-hidden whitespace-nowrap text-[9px] font-black tracking-widest text-white/90">
            <div className="inline-block animate-[marquee_14s_linear_infinite] pl-[100%] font-mono">
              {clubTicker}
            </div>
          </div>
        </div>
      )}

      {/* 
        ⚡ FIXED CHARGING STATS PILL:
        Moved layout positioning classes from top right to 'bottom-3 left-3 sm:bottom-4 sm:left-4'
        so it sits perfectly at the bottom left.
      */}
      <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 backdrop-blur-md bg-slate-950/70 border border-white/10 rounded-[14px] p-2 sm:rounded-[18px] sm:p-3 min-w-[125px] sm:min-w-[145px] shadow-xl transition-all duration-300">
        <div className="flex items-baseline gap-1">
          <span className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
            {battery}
          </span>
          {charging && (
