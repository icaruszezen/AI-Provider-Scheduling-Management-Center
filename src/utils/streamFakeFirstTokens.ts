export const MAX_STREAM_FAKE_FIRST_TOKENS = 32;
export const MAX_STREAM_FAKE_FIRST_TOKEN_RUNES = 32;

const tokenRuneCount = (token: string) => [...token].length;

export const sanitizeStreamFakeFirstTokens = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((item) => {
    if (typeof item !== 'string' || item === '') {
      return;
    }
    if (tokenRuneCount(item) > MAX_STREAM_FAKE_FIRST_TOKEN_RUNES || seen.has(item)) {
      return;
    }
    seen.add(item);
    out.push(item);
  });
  return out.slice(0, MAX_STREAM_FAKE_FIRST_TOKENS);
};

export const formatStreamFakeFirstTokenChip = (token: string) => JSON.stringify(token);

export const applyStreamFakeFirstTokensPayload = (
  payload: Record<string, unknown>,
  tokens: string[] | undefined
) => {
  const sanitized = sanitizeStreamFakeFirstTokens(tokens ?? []);
  if (sanitized.length) {
    payload['stream-fake-first-tokens'] = sanitized;
  }
};
