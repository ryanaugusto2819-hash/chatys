const TRANSCRIPTION_MODEL = "google/gemini-3.5-transcribe";
const MAX_AUDIO_BYTES = 14 * 1024 * 1024;
const RESPONSE_DEBOUNCE_MS = 5000;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function resolveAudioUrl(supabase: any, mediaUrl: string): Promise<string> {
  try {
    const parsed = new URL(mediaUrl);
    const marker = "/chat-media/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return mediaUrl;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível liberar o áudio para transcrição");
    return data.signedUrl;
  } catch (error) {
    if (error instanceof TypeError) return mediaUrl;
    throw error;
  }
}

async function transcribeResponseAudios(supabase: any, conversationId: string, messageIds: string[]) {
  const { data: messages, error: messageError } = await supabase
    .from("messages")
    .select("id, content, media_url, message_type")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .in("id", messageIds)
    .order("created_at", { ascending: true });
  if (messageError) throw messageError;
  const pendingAudios = (messages || []).filter((message: any) =>
    message.message_type === "audio"
    && !(typeof message.content === "string" && message.content.trim() && message.content !== "[Áudio]")
  );
  for (const message of pendingAudios) {
    if (!message.media_url) throw new Error("O áudio recebido não possui arquivo disponível para transcrição");

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) throw new Error("A transcrição de áudio não está configurada");
    const audioResponse = await fetch(await resolveAudioUrl(supabase, message.media_url));
    if (!audioResponse.ok) throw new Error(`Não foi possível baixar o áudio (${audioResponse.status})`);
    const audio = await audioResponse.blob();
    if (!audio.size) throw new Error("O áudio recebido está vazio");
    if (audio.size > MAX_AUDIO_BYTES) throw new Error("O áudio ultrapassa o limite de 14 MB para transcrição");
    const mimeType = audio.type.startsWith("audio/") ? audio.type.split(";")[0] : "audio/ogg";
    const extension = mimeType.includes("mpeg") ? "mp3" : mimeType.includes("wav") ? "wav" : mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "m4a" : "ogg";

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const form = new FormData();
      form.append("model", TRANSCRIPTION_MODEL);
      form.append("file", new File([audio], `audio.${extension}`, { type: mimeType }));
      form.append("response_format", "json");
      response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}` },
        body: form,
      });
      if (response.ok || (response.status !== 429 && response.status < 500)) break;
      if (attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : (attempt + 1) * 700 + Math.floor(Math.random() * 250));
      }
    }
    if (!response?.ok) {
      const raw = response ? await response.text() : "";
      let safeMessage = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string; error?: string | { message?: string } };
        safeMessage = parsed.message || (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) || raw;
      } catch { /* Preserve the gateway's safe response text. */ }
      throw new Error(safeMessage || `A transcrição falhou (${response?.status || 500})`);
    }
    const result = await response.json() as { text?: string };
    const transcript = result.text?.trim();
    if (!transcript) throw new Error("O áudio não contém fala reconhecível");
    const { error: updateError } = await supabase.from("messages").update({ content: `[Áudio transcrito]: ${transcript}` }).eq("id", message.id);
    if (updateError) throw updateError;
    console.info("[resume-waiting-flow] audio transcribed", { conversationId, messageId: message.id });
  }
}

export async function resumeWaitingFlow(supabase: any, conversationId: string, triggeringMessageId?: string): Promise<boolean> {
  const { data: waitingExecution, error: waitingError } = await supabase
    .from("flow_executions")
    .select("id, waiting_since")
    .eq("conversation_id", conversationId)
    .eq("status", "waiting_for_response")
    .order("waiting_since", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (waitingError) throw waitingError;
  if (!waitingExecution) return false;

  if (triggeringMessageId) {
    await wait(RESPONSE_DEBOUNCE_MS);
    const { data: latestCustomerMessage, error: latestError } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("sender_type", "customer")
      .gte("created_at", waitingExecution.waiting_since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (latestCustomerMessage?.id !== triggeringMessageId) {
      console.info("[resume-waiting-flow] response debounce extended", { conversationId, triggeringMessageId, latestMessageId: latestCustomerMessage?.id || null });
      return true;
    }
  }

  const { data: groupedMessages, error: groupedError } = await supabase
    .from("messages")
    .select("id, created_at")
    .eq("conversation_id", conversationId)
    .eq("sender_type", "customer")
    .gte("created_at", waitingExecution.waiting_since)
    .order("created_at", { ascending: true })
    .limit(30);
  if (groupedError) throw groupedError;
  const responseMessageIds = (groupedMessages || []).map((message: any) => message.id as string);
  if (triggeringMessageId && !responseMessageIds.includes(triggeringMessageId)) return true;

  const { data, error } = await supabase.rpc("claim_waiting_flow", {
    p_conversation_id: conversationId,
    p_reason: "response",
    p_execution_id: null,
  });
  if (error) {
    console.error("[resume-waiting-flow] claim failed", {
      conversationId,
      code: error.code || null,
      message: error.message || String(error),
    });
    throw error;
  }
  const claimed = data?.[0];
  if (!claimed?.execution_id || !claimed?.resume_node_id) {
    console.info("[resume-waiting-flow] no waiting execution", { conversationId });
    return true;
  }

  try {
    await transcribeResponseAudios(supabase, conversationId, responseMessageIds);
  } catch (transcriptionError) {
    const { error: restoreError } = await supabase
      .from("flow_executions")
      .update({ status: "waiting_for_response", resumed_at: null, resume_reason: null })
      .eq("id", claimed.execution_id)
      .eq("status", "running");
    console.error("[resume-waiting-flow] audio transcription blocked resume", {
      conversationId,
      executionId: claimed.execution_id,
      message: transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError),
      restoreError: restoreError?.message || null,
    });
    return true;
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${url}/functions/v1/execute-flow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      flowId: claimed.flow_id,
      conversationId: claimed.conversation_id,
      executionId: claimed.execution_id,
      resumeFromNodeId: claimed.resume_node_id,
      resumeReason: "response",
      senderLabel: "resposta-cliente",
      responseMessageIds,
      responseWindowStartedAt: groupedMessages?.[0]?.created_at || waitingExecution.waiting_since,
      responseWindowEndedAt: groupedMessages?.[groupedMessages.length - 1]?.created_at || null,
    }),
  });
  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 1000);
    const { error: restoreError } = await supabase
      .from("flow_executions")
      .update({ status: "waiting_for_response", resumed_at: null, resume_reason: null })
      .eq("id", claimed.execution_id)
      .eq("status", "running");
    console.error("[resume-waiting-flow] execution resume failed", {
      conversationId,
      executionId: claimed.execution_id,
      flowId: claimed.flow_id,
      resumeNodeId: claimed.resume_node_id,
      status: response.status,
      responseBody,
      restoreError: restoreError?.message || null,
    });
    throw new Error(`Falha ao retomar fluxo: HTTP ${response.status}`);
  }
  console.info("[resume-waiting-flow] execution resumed", {
    conversationId,
    executionId: claimed.execution_id,
    flowId: claimed.flow_id,
    resumeNodeId: claimed.resume_node_id,
  });
  return true;
}