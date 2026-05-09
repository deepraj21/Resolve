const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export const PRIMARY_MODEL = 'poolside/laguna-m.1:free';
export const FALLBACK_MODEL = 'z-ai/glm-4.5-air:free';

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://resolve-sre.app',
    'X-Title': 'Resolve AI SRE',
  };
}

export async function complete(systemPrompt, userPrompt, options = {}) {
  const models = [options.model || PRIMARY_MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const model of models) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: options.stream || false,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? 2000,
        }),
      });
      if (!response.ok) {
        const t = await response.text();
        lastErr = new Error(`OpenRouter ${response.status}: ${t}`);
        continue;
      }
      if (options.stream) return response;
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        lastErr = new Error('Empty completion');
        continue;
      }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('OpenRouter request failed');
}

export async function completeJSON(systemPrompt, userPrompt, options = {}) {
  const augmentedSystem =
    systemPrompt +
    '\n\nRespond ONLY with valid JSON. No markdown fences, no explanation outside JSON.';
  const raw = await complete(augmentedSystem, userPrompt, {
    ...options,
    temperature: options.temperature ?? 0.6,
    max_tokens: options.max_tokens ?? 4000,
  });
  const cleaned = raw.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}

export async function streamCompletion(systemPrompt, userPrompt, options = {}) {
  const models = [options.model || PRIMARY_MODEL, FALLBACK_MODEL];
  let lastErr;
  for (const model of models) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: true,
          temperature: options.temperature ?? 0.5,
          max_tokens: options.max_tokens ?? 2000,
        }),
      });
      if (!response.ok) {
        const t = await response.text();
        lastErr = new Error(`OpenRouter ${response.status}: ${t}`);
        continue;
      }
      return response;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('OpenRouter stream failed');
}

/** Parse OpenAI-compatible SSE stream; yields text deltas */
export async function* iterateOpenRouterTextStream(responseBody) {
  const reader = responseBody.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        /* ignore partial JSON lines */
      }
    }
  }
}
