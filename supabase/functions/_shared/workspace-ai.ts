export interface WorkspaceAIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
}

const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function getWorkspaceAIConfig(
  supabase: any,
  workspaceId: string | null | undefined
): Promise<WorkspaceAIConfig> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";

  const fallback: WorkspaceAIConfig = {
    apiUrl: LOVABLE_URL,
    apiKey: lovableKey,
    model: LOVABLE_MODEL,
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: null,
  };

  if (!workspaceId) return fallback;

  const { data } = await supabase
    .from("ai_configs")
    .select("openai_api_key, model, temperature, max_tokens, system_prompt")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!data?.openai_api_key) return fallback;

  return {
    apiUrl: OPENAI_URL,
    apiKey: data.openai_api_key,
    model: data.model || "gpt-4o-mini",
    temperature: data.temperature ?? 0.7,
    maxTokens: data.max_tokens ?? 1000,
    systemPrompt: data.system_prompt || null,
  };
}
