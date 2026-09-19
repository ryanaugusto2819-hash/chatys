import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...jsonHeaders, Allow: "POST" } },
    );
  }

  try {
    const payload: unknown = await req.json();

    console.log("[datacrazy-webhook] Payload received:", JSON.stringify(payload));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error(
      "[datacrazy-webhook] Invalid JSON payload:",
      error instanceof Error ? error.message : String(error),
    );

    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON payload" }),
      { status: 400, headers: jsonHeaders },
    );
  }
});
