import { corsHeaders } from '@supabase/supabase-js/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const lat = url.searchParams.get('lat') || '54.97'
    const lng = url.searchParams.get('lng') || '-1.61'

    const apiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,windspeed_10m,cloudcover,weathercode&daily=temperature_2m_max,temperature_2m_min,windspeed_10m_max,sunshine_duration,weathercode&forecast_days=5&timezone=Europe%2FLondon`

    const res = await fetch(apiUrl)
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Weather API error: ${res.status}` }), {
        status: res.status,
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
