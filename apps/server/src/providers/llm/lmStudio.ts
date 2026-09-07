import { createOpenAiCompatibleAdapter } from './openaiCompatible.js';

/**
 * Spec §29 — LM Studio. Its developer server exposes OpenAI-compatible APIs on
 * localhost, conventionally at port 1234.
 */
export const LM_STUDIO_DEFAULT_ENDPOINT = 'http://127.0.0.1:1234/v1';

export const lmStudioAdapter = createOpenAiCompatibleAdapter({
  key: 'lm_studio',
  label: 'LM Studio',
  defaultEndpoint: LM_STUDIO_DEFAULT_ENDPOINT,
  authKind: 'none',
  requiresServerSideCredentials: false,
});

export async function detectLmStudio(timeoutMs = 1_500): Promise<string | null> {
  const candidates = ['http://127.0.0.1:1234/v1', 'http://localhost:1234/v1'];
  for (const base of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}/models`, { signal: controller.signal });
      if (response.ok) return base;
    } catch {
      // Server not started; LM Studio requires starting it explicitly.
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
