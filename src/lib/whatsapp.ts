import { supabase } from "@/integrations/supabase/client";

// Cache profile id per session to avoid repeated queries
let cachedProfileId: string | null | undefined = undefined;

export async function sendWhatsAppMessage(
  conversationId: string,
  message: string,
  options?: { mediaUrl?: string; messageType?: string }
) {
  // Run profile lookup and conversation connection check in parallel
  const [profileResult, conversationResult] = await Promise.all([
    // Only fetch profile once per session
    cachedProfileId !== undefined
      ? Promise.resolve(cachedProfileId)
      : (async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('user_id', session.user.id)
              .maybeSingle();
            cachedProfileId = profile?.id ?? null;
          } else {
            cachedProfileId = null;
          }
          return cachedProfileId;
        })(),
    // Get the conversation's connection_config_id
    supabase
      .from("conversations")
      .select("connection_config_id")
      .eq("id", conversationId)
      .single(),
  ]);

  const senderAgentId = profileResult;

  // Determine which send function based on the conversation's actual connection
  let functionName = "whatsapp-send"; // default

  if (conversationResult.data?.connection_config_id) {
    const { data: connConfig } = await supabase
      .from("connection_configs")
      .select("connection_id")
      .eq("id", conversationResult.data.connection_config_id)
      .single();

    if (connConfig?.connection_id === "zapi") {
      functionName = "zapi-send";
    } else if (connConfig?.connection_id === "evolution") {
      functionName = "evolution-send";
    } else if (connConfig?.connection_id === "extension") {
      functionName = "extension-send";
    }
  } else {
    // No connection on conversation — fallback: check if any Z-API/Evolution is active
    const { data: connections } = await supabase
      .from("connection_configs")
      .select("connection_id")
      .in("connection_id", ["zapi", "evolution"])
      .eq("is_connected", true)
      .limit(1);

    if (connections && connections.length > 0) {
      functionName = connections[0].connection_id === "evolution" ? "evolution-send" : "zapi-send";
    }
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body: {
      conversationId,
      message,
      senderAgentId,
      senderLabel: 'humano',
      ...(options?.mediaUrl ? { mediaUrl: options.mediaUrl, type: options.messageType || 'image' } : {}),
    },
  });

  // supabase.functions.invoke returns error for non-2xx, but the edge function
  // may have already saved the message (even as failed). Check data first.
  if (error) {
    // Try to parse the error body — the edge function returns savedMessage even on 502
    let parsed: any = null;
    try {
      if (error instanceof Object && 'context' in error) {
        const ctx = (error as any).context;
        if (ctx?.body) {
          const reader = ctx.body.getReader?.();
          if (reader) {
            const { value } = await reader.read();
            parsed = JSON.parse(new TextDecoder().decode(value));
          }
        }
      }
    } catch { /* ignore parse errors */ }

    // If the edge function saved the message (even as failed), return it
    if (parsed?.savedMessage) {
      return parsed;
    }
    throw error;
  }

  return data;
}
