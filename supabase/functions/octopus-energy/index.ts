import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OCTOPUS_BASE = 'https://api.octopus.energy/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('OCTOPUS_API_KEY');
  const accountId = Deno.env.get('OCTOPUS_ACCOUNT_ID');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OCTOPUS_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'rates';
    const authHeader = 'Basic ' + btoa(apiKey + ':');

    if (action === 'account') {
      if (!accountId) {
        return new Response(JSON.stringify({ error: 'OCTOPUS_ACCOUNT_ID not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const res = await fetch(`${OCTOPUS_BASE}/accounts/${accountId}/`, {
        headers: { 'Authorization': authHeader },
      });
      if (!res.ok) throw new Error(`Octopus API error [${res.status}]: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'rates') {
      const tariffCode = url.searchParams.get('tariff_code') || 'AGILE-24-10-01';
      const region = url.searchParams.get('region') || 'C';
      const periodFrom = url.searchParams.get('period_from') || '';
      const periodTo = url.searchParams.get('period_to') || '';

      let ratesUrl = `${OCTOPUS_BASE}/products/${tariffCode}/electricity-tariffs/E-1R-${tariffCode}-${region}/standard-unit-rates/`;
      const params = new URLSearchParams();
      if (periodFrom) params.set('period_from', periodFrom);
      if (periodTo) params.set('period_to', periodTo);
      params.set('page_size', '200');
      if (params.toString()) ratesUrl += '?' + params.toString();

      const res = await fetch(ratesUrl, {
        headers: { 'Authorization': authHeader },
      });
      if (!res.ok) throw new Error(`Octopus rates API error [${res.status}]: ${await res.text()}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Octopus API error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
