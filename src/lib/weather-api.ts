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

export async function fetchWeatherForecast(region: string): Promise<{
  hourly: WeatherHourly[];
  daily: WeatherDaily[];
}> {
  const { lat, lng } = getCoords(region);

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
  const data = await res.json();

  const hourly: WeatherHourly[] = data.hourly.time.map((t: string, i: number) => ({
    time: t,
    temperature_2m: data.hourly.temperature_2m[i],
    windspeed_10m: data.hourly.windspeed_10m[i],
    cloudcover: data.hourly.cloudcover[i],
    weathercode: data.hourly.weathercode[i],
  }));

  // Build daily summary with predicted agile prices based on weather
  const daily: WeatherDaily[] = data.daily.time.map((t: string, i: number) => {
    const windMax = data.daily.windspeed_10m_max[i];
    const sunshineHrs = (data.daily.sunshine_duration[i] || 0) / 3600; // seconds -> hours
    const tempMax = data.daily.temperature_2m_max[i];

    // Simple predictive model: high wind + sun = cheaper agile (more renewables)
    // Low wind + cloudy + cold = expensive (more gas generation)
    const windFactor = Math.max(0, 1 - windMax / 50); // 0-1, lower = more wind
    const solarFactor = Math.max(0, 1 - sunshineHrs / 14); // 0-1, lower = more sun
    const demandFactor = tempMax < 5 ? 1.3 : tempMax < 10 ? 1.1 : tempMax > 20 ? 0.85 : 1;

    const basePrice = 18; // avg baseline p/kWh
    const avgPrice = basePrice * (0.5 + 0.3 * windFactor + 0.2 * solarFactor) * demandFactor;

    return {
      date: t,
      temp_max: data.daily.temperature_2m_max[i],
      temp_min: data.daily.temperature_2m_min[i],
      windspeed_max: windMax,
      sunshine_hours: Math.round(sunshineHrs * 10) / 10,
      weathercode: data.daily.weathercode[i],
      predicted_agile_avg: Math.round(avgPrice * 100) / 100,
      predicted_agile_low: Math.round(avgPrice * 0.35 * 100) / 100,
      predicted_agile_high: Math.round(avgPrice * 2.2 * 100) / 100,
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
