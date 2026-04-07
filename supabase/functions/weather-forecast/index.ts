const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || i === retries) return res;
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Fetch failed after retries');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = url.searchParams.get('lat') || '54.97'
    const lng = url.searchParams.get('lng') || '-1.61'

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,wind_speed_10m,cloud_cover,weather_code&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,sunshine_duration,weather_code&forecast_days=5&timezone=Europe%2FLondon`

    const res = await fetchWithRetry(apiUrl)
    if (!res.ok) {
      const body = await res.text()
      return new Response(JSON.stringify({ error: `Weather API error: ${res.status}`, detail: body }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
