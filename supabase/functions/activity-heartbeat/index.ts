import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const session_id = String(body.session_id ?? '').slice(0, 128);
    const route = body.route ? String(body.route).slice(0, 256) : null;
    const action_delta = Number.isFinite(body.action_delta) ? Math.max(0, Math.min(50, body.action_delta)) : 0;
    const workspace_id = body.workspace_id ?? null;

    if (!session_id) {
      return new Response(JSON.stringify({ error: 'session_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract IP from headers (first x-forwarded-for entry)
    const xff = req.headers.get('x-forwarded-for') ?? '';
    const ip = (xff.split(',')[0].trim()) ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      null;
    const user_agent = (req.headers.get('user-agent') ?? '').slice(0, 512);

    // Upsert on (user_id, session_id)
    const { data: existing } = await supabase
      .from('activity_sessions')
      .select('id, actions_count')
      .eq('user_id', userData.user.id)
      .eq('session_id', session_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('activity_sessions')
        .update({
          last_seen: new Date().toISOString(),
          actions_count: (existing.actions_count ?? 0) + action_delta,
          ip,
          user_agent,
          route,
          workspace_id,
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('activity_sessions').insert({
        user_id: userData.user.id,
        session_id,
        ip,
        user_agent,
        route,
        workspace_id,
        actions_count: action_delta,
      });
    }

    return new Response(JSON.stringify({ ok: true, ip }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
