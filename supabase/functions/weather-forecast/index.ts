const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const FORECAST_DAYS = 5

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function seededNoise(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function generateFallbackForecast(lat: number, lng: number) {
  const now = new Date()
  const locationSeed = Math.round((lat + 90) * 1000 + (lng + 180) * 1000)

  const hourly = {
    time: [] as string[],
    temperature_2m: [] as number[],
    wind_speed_10m: [] as number[],
    cloud_cover: [] as number[],
    weather_code: [] as number[],
  }

  const daily = {
    time: [] as string[],
    temperature_2m_max: [] as number[],
    temperature_2m_min: [] as number[],
    wind_speed_10m_max: [] as number[],
    sunshine_duration: [] as number[],
    weather_code: [] as number[],
    sunrise: [] as string[],
    sunset: [] as string[],
  }

  for (let day = 0; day < FORECAST_DAYS; day++) {
    const dayDate = new Date(now)
    dayDate.setHours(0, 0, 0, 0)
    dayDate.setDate(dayDate.getDate() + day)

    let dayMin = Number.POSITIVE_INFINITY
    let dayMax = Number.NEGATIVE_INFINITY
    let dayWindMax = 0
    let sunHours = 0
    const dayWeatherNoise = seededNoise(locationSeed + day * 17)
    let dayWeatherCode = 1

    for (let hour = 0; hour < 24; hour++) {
      const sampleTime = new Date(dayDate)
      sampleTime.setHours(hour, 0, 0, 0)
      hourly.time.push(sampleTime.toISOString().slice(0, 16))

      const tempBase = 10 + Math.sin(((hour - 6) / 24) * Math.PI * 2) * 4
      const tempVariation = (seededNoise(locationSeed + day * 37 + hour * 13) - 0.5) * 3
      const temp = Math.round((tempBase + tempVariation + (lat - 54) * 0.15) * 10) / 10
      hourly.temperature_2m.push(temp)
      dayMin = Math.min(dayMin, temp)
      dayMax = Math.max(dayMax, temp)

      const wind = Math.round((12 + seededNoise(locationSeed + day * 19 + hour * 11) * 25) * 10) / 10
      hourly.wind_speed_10m.push(wind)
      dayWindMax = Math.max(dayWindMax, wind)

      const cloud = Math.round(clamp(25 + seededNoise(locationSeed + day * 29 + hour * 7) * 70, 5, 100))
      hourly.cloud_cover.push(cloud)

      const isDaylight = hour >= 7 && hour <= 18
      if (isDaylight) {
        sunHours += clamp((100 - cloud) / 100, 0, 1)
      }

      let weatherCode = 1
      if (cloud > 85) weatherCode = 61
      else if (cloud > 70) weatherCode = 3
      else if (cloud > 45) weatherCode = 2
      else weatherCode = 0

      hourly.weather_code.push(weatherCode)
      if (hour === 12) dayWeatherCode = weatherCode
    }

    daily.time.push(dayDate.toISOString().slice(0, 10))
    daily.temperature_2m_min.push(Math.round(dayMin * 10) / 10)
    daily.temperature_2m_max.push(Math.round(dayMax * 10) / 10)
    daily.wind_speed_10m_max.push(Math.round(dayWindMax * 10) / 10)
    daily.sunshine_duration.push(Math.round((sunHours + dayWeatherNoise) * 3600))
    daily.weather_code.push(dayWeatherCode)

    const sunrise = new Date(dayDate)
    sunrise.setHours(7, 30, 0, 0)

    const sunset = new Date(dayDate)
    sunset.setHours(17, 0, 0, 0)

    daily.sunrise.push(sunrise.toISOString())
    daily.sunset.push(sunset.toISOString())
  }

  return {
    ...hourly,
    daily,
  }
}

async function fetchWithRetry(url: string, retries = 2, delayMs = 900): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok || attempt === retries) return res
    } catch (error) {
      if (attempt === retries) throw error
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  throw new Error('Fetch failed after retries')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = Number(url.searchParams.get('lat') || '54.97')
    const lng = Number(url.searchParams.get('lng') || '-1.61')

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,wind_speed_10m,cloud_cover,weather_code&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,sunshine_duration,weather_code,sunrise,sunset&forecast_days=${FORECAST_DAYS}&timezone=Europe%2FLondon`

    try {
      const res = await fetchWithRetry(apiUrl)

      if (res.ok) {
        const data = await res.json()
        return new Response(JSON.stringify({ ...data, source: 'live' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const detail = await res.text()
      console.error('Open-Meteo upstream error', res.status, detail)
    } catch (error) {
      console.error('Open-Meteo fetch failed', error)
    }

    const fallbackData = generateFallbackForecast(lat, lng)
    return new Response(JSON.stringify({
      hourly: {
        time: fallbackData.time,
        temperature_2m: fallbackData.temperature_2m,
        wind_speed_10m: fallbackData.wind_speed_10m,
        cloud_cover: fallbackData.cloud_cover,
        weather_code: fallbackData.weather_code,
      },
      daily: fallbackData.daily,
      source: 'estimated',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})