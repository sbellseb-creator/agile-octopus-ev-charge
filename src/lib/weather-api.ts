// Open-Meteo free weather API — no API key required
export interface WeatherHourly {
  time: string;
  temperature_2m: number;
  windspeed_10m: number;
  cloudcover: number;
  weathercode: number;
}

export interface WeatherDaily {
  date: string;
  temp_max: number;
  temp_min: number;
  windspeed_max: number;
  sunshine_hours: number;
  weathercode: number;
  predicted_agile_avg: number;
  predicted_agile_low: number;
  predicted_agile_high: number;
}

// Map region codes to approximate lat/lng
const REGION_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  A: { lat: 57.15, lng: -2.09, label: "East Scotland" },
  B: { lat: 52.63, lng: 1.3, label: "East England" },
  C: { lat: 51.48, lng: -3.18, label: "South Wales" },
  D: { lat: 52.41, lng: -1.51, label: "West Midlands" },
  E: { lat: 52.95, lng: -1.15, label: "East Midlands" },
  F: { lat: 54.97, lng: -1.61, label: "North East" },
  G: { lat: 53.48, lng: -2.24, label: "North West" },
  H: { lat: 51.45, lng: -2.59, label: "South West" },
  J: { lat: 51.51, lng: -0.13, label: "South England" },
  K: { lat: 53.96, lng: -1.08, label: "Yorkshire" },
  L: { lat: 52.68, lng: -2.45, label: "Merseyside" },
  M: { lat: 56.49, lng: -4.2, label: "South Scotland" },
  N: { lat: 55.95, lng: -3.19, label: "Edinburgh" },
  P: { lat: 53.23, lng: -0.54, label: "Lincolnshire" },
};

function getCoords(region: string) {
  return REGION_COORDS[region] || REGION_COORDS.F;
}

function generateFallbackData(): { hourly: any; daily: any } {
  const now = new Date();
  const hourlyTimes: string[] = [];
  const temps: number[] = [];
  const winds: number[] = [];
  const clouds: number[] = [];
  const codes: number[] = [];

  for (let d = 0; d < 5; d++) {
    for (let h = 0; h < 24; h++) {
      const dt = new Date(now);
      dt.setDate(dt.getDate() + d);
      dt.setHours(h, 0, 0, 0);
      hourlyTimes.push(dt.toISOString().slice(0, 16));
      const baseTemp = 8 + Math.sin((h - 6) * Math.PI / 12) * 5 + (Math.random() - 0.5) * 3;
      temps.push(Math.round(baseTemp * 10) / 10);
      winds.push(Math.round((15 + Math.random() * 20) * 10) / 10);
      clouds.push(Math.round(40 + Math.random() * 40));
      codes.push([0, 1, 2, 3, 45, 51, 61][Math.floor(Math.random() * 7)]);
    }
  }

  const dailyTimes: string[] = [];
  const tMax: number[] = [], tMin: number[] = [], wMax: number[] = [], sun: number[] = [], dCodes: number[] = [];
  for (let d = 0; d < 5; d++) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    dailyTimes.push(dt.toISOString().slice(0, 10));
    tMax.push(Math.round((12 + Math.random() * 6) * 10) / 10);
    tMin.push(Math.round((4 + Math.random() * 4) * 10) / 10);
    wMax.push(Math.round((20 + Math.random() * 25) * 10) / 10);
    sun.push(Math.round((3 + Math.random() * 8) * 3600));
    dCodes.push([0, 1, 2, 3, 61][Math.floor(Math.random() * 5)]);
  }

  return {
    hourly: { time: hourlyTimes, temperature_2m: temps, wind_speed_10m: winds, cloud_cover: clouds, weather_code: codes },
    daily: { time: dailyTimes, temperature_2m_max: tMax, temperature_2m_min: tMin, wind_speed_10m_max: wMax, sunshine_duration: sun, weather_code: dCodes },
  };
}

export interface AgileBaseline {
  avg: number;       // p/kWh — recent rolling average
  low: number;       // 10th percentile
  high: number;      // 90th percentile
  source: "live" | "default";
}

const DEFAULT_BASELINE: AgileBaseline = { avg: 18, low: 6, high: 35, source: "default" };

export async function fetchWeatherForecast(
  region: string,
  baseline: AgileBaseline = DEFAULT_BASELINE,
): Promise<{
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
}> {
  const { lat, lng } = getCoords(region);

  let data: any;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const url = `${supabaseUrl}/functions/v1/weather-forecast?lat=${lat}&lng=${lng}`;

    const res = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    data = await res.json();
  } catch {
    // Open-Meteo is down — use generated fallback data
    console.warn('Weather API unavailable, using estimated data');
    data = generateFallbackData();
  }

  const hourly: WeatherHourly[] = data.hourly.time.map((t: string, i: number) => ({
    time: t,
    temperature_2m: data.hourly.temperature_2m[i],
    windspeed_10m: (data.hourly.wind_speed_10m || data.hourly.windspeed_10m)[i],
    cloudcover: (data.hourly.cloud_cover || data.hourly.cloudcover)[i],
    weathercode: (data.hourly.weather_code || data.hourly.weathercode)[i],
  }));

  // Build daily summary with predicted agile prices anchored to the user's
  // recent rolling baseline. Weather acts as a multiplier (±25%) rather than
  // an absolute price source.
  const daily: WeatherDaily[] = data.daily.time.map((t: string, i: number) => {
    const windMax = (data.daily.wind_speed_10m_max || data.daily.windspeed_10m_max)[i];
    const sunshineHrs = (data.daily.sunshine_duration[i] || 0) / 3600;
    const tempMax = data.daily.temperature_2m_max[i];
    const tempMin = data.daily.temperature_2m_min[i];

    // Wind multiplier: more wind => cheaper. UK avg max wind ~25 km/h.
    // Strong wind (40+ km/h) => ~-15%, calm (≤10 km/h) => ~+15%.
    const windMult = 1 - Math.max(-0.15, Math.min(0.15, (windMax - 25) / 100));
    // Sun multiplier: more sun => cheaper daytime supply (small effect, ~±5%).
    const sunMult = 1 - Math.max(-0.05, Math.min(0.05, (sunshineHrs - 5) / 100));
    // Demand multiplier: cold mornings + hot evenings push demand up.
    const avgTemp = (tempMax + tempMin) / 2;
    const demandMult = avgTemp < 3 ? 1.18 : avgTemp < 8 ? 1.08 : avgTemp > 22 ? 1.05 : 1.0;

    const mult = windMult * sunMult * demandMult;
    const avgPrice = baseline.avg * mult;
    // Spread between low/high follows the baseline's observed spread, scaled by the multiplier.
    const lowPrice = baseline.low * mult;
    const highPrice = baseline.high * mult;

    return {
      date: t,
      temp_max: tempMax,
      temp_min: tempMin,
      windspeed_max: windMax,
      sunshine_hours: Math.round(sunshineHrs * 10) / 10,
      weathercode: (data.daily.weather_code || data.daily.weathercode)[i],
      predicted_agile_avg: Math.round(avgPrice * 100) / 100,
      predicted_agile_low: Math.round(lowPrice * 100) / 100,
      predicted_agile_high: Math.round(highPrice * 100) / 100,
    };
  });

  return { hourly, daily };
}

export function weatherCodeToEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

export function weatherCodeToLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Foggy";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Fair";
}
