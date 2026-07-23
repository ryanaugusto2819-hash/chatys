import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BITLY_API = 'https://api-ssl.bitly.com/v4/shorten';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'URL inválida' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let token = Deno.env.get('BITLY_ACCESS_TOKEN') || '';
    // Suporta token com ou sem prefixo "Bearer "
    if (token && !token.toLowerCase().startsWith('bearer ')) {
      token = `Bearer ${token}`;
    }
    if (!token) {
      return new Response(JSON.stringify({ error: 'Bitly não configurado' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(BITLY_API, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ long_url: url }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.link) {
      return new Response(JSON.stringify({ error: 'Falha ao encurtar no Bitly', detail: payload?.message || payload?.description || res.statusText }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ shortUrl: payload.link }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
