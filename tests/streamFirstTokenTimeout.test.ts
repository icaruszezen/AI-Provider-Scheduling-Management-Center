import { describe, expect, test } from 'bun:test';
import { normalizeGeminiKeyConfig, normalizeOpenAIProvider } from '../src/services/api/transformers';
import {
  applyStreamFirstTokenTimeoutPayload,
  normalizeStreamFirstTokenTimeout,
  streamFirstTokenTimeoutFromForm,
} from '../src/utils/streamFirstTokenTimeout';

describe('stream first-token timeout', () => {
  test('normalizes empty, zero, and out of range values', () => {
    expect(normalizeStreamFirstTokenTimeout(undefined)).toBeUndefined();
    expect(normalizeStreamFirstTokenTimeout(null)).toBeUndefined();
    expect(normalizeStreamFirstTokenTimeout(0)).toBe(0);
    expect(normalizeStreamFirstTokenTimeout(15.9)).toBe(15);
    expect(normalizeStreamFirstTokenTimeout(-1)).toBeUndefined();
    expect(normalizeStreamFirstTokenTimeout(99999)).toBe(3600);
    expect(streamFirstTokenTimeoutFromForm(undefined)).toBeNull();
    expect(streamFirstTokenTimeoutFromForm(0)).toBe(0);
  });

  test('writes null to clear and a number to set', () => {
    const cleared: Record<string, unknown> = {};
    applyStreamFirstTokenTimeoutPayload(cleared, { streamFirstTokenTimeoutSeconds: null });
    expect(cleared).toEqual({ 'stream-first-token-timeout-seconds': null });

    const set: Record<string, unknown> = {};
    applyStreamFirstTokenTimeoutPayload(set, { streamFirstTokenTimeoutSeconds: 8 });
    expect(set).toEqual({ 'stream-first-token-timeout-seconds': 8 });
  });

  test('reads the field from channel config', () => {
    const gemini = normalizeGeminiKeyConfig({
      'api-key': 'g-1',
      'stream-first-token-timeout-seconds': 9,
    });
    expect(gemini?.streamFirstTokenTimeoutSeconds).toBe(9);

    const omitted = normalizeOpenAIProvider({
      name: 'compat',
      'base-url': 'https://example.test/v1',
    });
    expect(omitted?.streamFirstTokenTimeoutSeconds).toBeUndefined();
  });
});
