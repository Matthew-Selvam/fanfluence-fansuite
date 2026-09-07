import { createOpenAiCompatibleAdapter } from './openaiCompatible.js';

/**
 * Spec §28 — Ollama. The documented OpenAI-compatible configuration is the
 * local `/v1` base URL plus a model name, so the shared adapter covers it
 * without a bespoke client.
 */
export const OLLAMA_DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';

export const ollamaAdapter = createOpenAiCompatibleAdapter({
  key: 'ollama',
  label: 'Ollama',
  defaultEndpoint: OLLAMA_DEFAULT_ENDPOINT,
  authKind: 'none',
  requiresServerSideCredentials: false,
});

/**
 * Spec §28 step 1 — detect a local Ollama before the user has configured
 * anything. Tries the conventional ports and returns the first that answers.
 */
export async function detectOllama(timeoutMs = 1_500): Promise<string | null> {
  const candidates = ['http://127.0.0.1:11434', 'http://localhost:11434'];
  for (const origin of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin}/api/tags`, { signal: controller.signal });
      if (response.ok) return `${origin}/v1`;
    } catch {
      // Not running here; try the next candidate.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
