import { describe, expect, test } from 'bun:test';
import { normalizeGeminiKeyConfig, normalizeOpenAIProvider } from '../src/services/api/transformers';
import {
  applyProviderRetryPayload,
  formatProviderRetryStatusCodes,
  normalizeProviderRetryCount,
  parseProviderRetryStatusCodesInput,
  providerRetryFieldsFromForm,
  providerRetryStatusCodesInputIsValid,
} from '../src/utils/providerRetry';

describe('provider retry helpers', () => {
  test('parses and formats status codes', () => {
    expect(parseProviderRetryStatusCodesInput('429, 401 401, 99, 600')).toEqual([401, 429]);
    expect(formatProviderRetryStatusCodes([401, 403, 429])).toBe('401, 403, 429');
    expect(formatProviderRetryStatusCodes([])).toBe('');
    expect(normalizeProviderRetryCount(12)).toBe(10);
    expect(normalizeProviderRetryCount(-1)).toBeUndefined();
    expect(normalizeProviderRetryCount(0)).toBe(0);
  });

  test('flags status code input that parsing would silently drop', () => {
    expect(providerRetryStatusCodesInputIsValid('')).toBe(true);
    expect(providerRetryStatusCodesInputIsValid('429, 500 503')).toBe(true);
    expect(providerRetryStatusCodesInputIsValid('429, 99')).toBe(false);
    expect(providerRetryStatusCodesInputIsValid('429, 600')).toBe(false);
    expect(providerRetryStatusCodesInputIsValid('429, abc')).toBe(false);
  });
});

describe('provider retry transformers', () => {
  test('reads omitted, custom, and empty status codes', () => {
    const omitted = normalizeGeminiKeyConfig({
      'api-key': 'g-1',
      'provider-retry-count': 3,
    });
    expect(omitted?.providerRetryCount).toBe(3);
    expect(omitted?.providerRetryStatusCodes).toBeUndefined();

    const custom = normalizeGeminiKeyConfig({
      'api-key': 'g-2',
      'provider-retry-count': 2,
      'provider-retry-status-codes': [429, 500, 429],
    });
    expect(custom?.providerRetryStatusCodes).toEqual([429, 500]);

    // An empty list matches nothing, so it surfaces as "no retries" rather than
    // as an empty input box the form would read back as "use the defaults".
    const empty = normalizeGeminiKeyConfig({
      'api-key': 'g-3',
      'provider-retry-count': 4,
      'provider-retry-status-codes': [],
    });
    expect(empty?.providerRetryCount).toBe(0);
    expect(empty?.providerRetryStatusCodes).toBeUndefined();

    // A malformed value is not a disable instruction.
    const malformed = normalizeGeminiKeyConfig({
      'api-key': 'g-4',
      'provider-retry-count': 2,
      'provider-retry-status-codes': 'nonsense',
    });
    expect(malformed?.providerRetryCount).toBe(2);
    expect(malformed?.providerRetryStatusCodes).toBeUndefined();

    const openai = normalizeOpenAIProvider({
      name: 'compat',
      'base-url': 'https://example.com/v1',
      'api-key-entries': [{ 'api-key': 'sk-1' }],
      'provider-retry-count': 1,
      'provider-retry-status-codes': [401, 403],
    });
    expect(openai?.providerRetryCount).toBe(1);
    expect(openai?.providerRetryStatusCodes).toEqual([401, 403]);
  });
});

describe('provider retry serialize round-trip', () => {
  test('distinguishes untouched, cleared, and explicit values', () => {
    // undefined leaves whatever the server already stores alone.
    const omitted: Record<string, unknown> = {};
    applyProviderRetryPayload(omitted, {});
    expect(omitted).toEqual({});

    // null removes the per-credential override.
    const cleared: Record<string, unknown> = {};
    applyProviderRetryPayload(cleared, {
      providerRetryCount: null,
      providerRetryStatusCodes: null,
    });
    expect(cleared).toEqual({
      'provider-retry-count': null,
      'provider-retry-status-codes': null,
    });

    // An empty array is sent verbatim so it can disable status-code matching.
    const zero: Record<string, unknown> = {};
    applyProviderRetryPayload(zero, { providerRetryCount: 0, providerRetryStatusCodes: [] });
    expect(zero).toEqual({ 'provider-retry-count': 0, 'provider-retry-status-codes': [] });
    expect(normalizeGeminiKeyConfig({ 'api-key': 'g-0', ...zero })?.providerRetryCount).toBe(0);

    const custom: Record<string, unknown> = {};
    applyProviderRetryPayload(custom, {
      providerRetryCount: 3,
      providerRetryStatusCodes: [429, 401],
    });
    expect(custom).toEqual({
      'provider-retry-count': 3,
      'provider-retry-status-codes': [429, 401],
    });
    const normalized = normalizeGeminiKeyConfig({ 'api-key': 'g-custom', ...custom });
    expect(normalized?.providerRetryCount).toBe(3);
    expect(normalized?.providerRetryStatusCodes).toEqual([401, 429]);
  });

  test('an emptied form field clears the override instead of keeping it', () => {
    expect(providerRetryFieldsFromForm({})).toEqual({
      providerRetryCount: null,
      providerRetryStatusCodes: null,
    });
    expect(
      providerRetryFieldsFromForm({ providerRetryCount: 2, providerRetryStatusCodesText: '' })
    ).toEqual({ providerRetryCount: 2, providerRetryStatusCodes: null });
    expect(
      providerRetryFieldsFromForm({
        providerRetryCount: 3,
        providerRetryStatusCodesText: '500, 429',
      })
    ).toEqual({ providerRetryCount: 3, providerRetryStatusCodes: [429, 500] });

    // The cleared form reaches the wire as an explicit null, which is what the
    // backend reads as "drop the per-credential override".
    const payload: Record<string, unknown> = {};
    applyProviderRetryPayload(payload, providerRetryFieldsFromForm({}));
    expect(payload).toEqual({
      'provider-retry-count': null,
      'provider-retry-status-codes': null,
    });
  });
});
