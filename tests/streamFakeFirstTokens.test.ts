import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StreamFakeFirstTokensFields } from '../src/features/providers/sheets/forms/StreamFakeFirstTokensFields';
import '../src/i18n';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse, normalizeProviderKeyConfig } from '../src/services/api/transformers';
import {
  applyStreamFakeFirstTokensPayload,
  formatStreamFakeFirstTokenChip,
  sanitizeStreamFakeFirstTokens,
} from '../src/utils/streamFakeFirstTokens';

const originalGet = apiClient.get;
const originalPut = apiClient.put;

afterEach(() => {
  apiClient.get = originalGet;
  apiClient.put = originalPut;
});

type ApiCall = { method: string; url: string; data?: unknown };

const stubConfigAndCapturePut = (existing: unknown[]) => {
  const calls: ApiCall[] = [];
  apiClient.get = (async (url: string) => {
    calls.push({ method: 'GET', url });
    return { 'codex-api-key': existing, 'xai-api-key': existing };
  }) as typeof apiClient.get;
  apiClient.put = (async (url: string, data?: unknown) => {
    calls.push({ method: 'PUT', url, data });
    return undefined;
  }) as typeof apiClient.put;
  return calls;
};

const putPayloads = (calls: ApiCall[]) =>
  calls
    .filter((call) => call.method === 'PUT')
    .map((call) => call.data as Record<string, unknown>[]);

describe('stream fake first token helpers', () => {
  test('keeps spaces, drops empties, and exact-dedupes without trimming', () => {
    expect(sanitizeStreamFakeFirstTokens([' ', '-', ' ', '', ' -hello'])).toEqual([
      ' ',
      '-',
      ' -hello',
    ]);
    expect(sanitizeStreamFakeFirstTokens(undefined)).toEqual([]);
    expect(sanitizeStreamFakeFirstTokens(['   '])).toEqual(['   ']);
    expect(formatStreamFakeFirstTokenChip(' ')).toBe('" "');
  });

  test('renders a space chip without collapsing it', () => {
    const markup = renderToStaticMarkup(
      createElement(StreamFakeFirstTokensFields, {
        tokens: [' ', '-'],
        mutating: false,
        onChange: () => undefined,
      })
    );
    expect(markup).toContain('&quot; &quot;');
    expect(markup).toContain('&quot;-&quot;');
  });

  test('omits the payload field when the list is empty', () => {
    const empty: Record<string, unknown> = {};
    applyStreamFakeFirstTokensPayload(empty, []);
    expect(empty).toEqual({});

    const enabled: Record<string, unknown> = {};
    applyStreamFakeFirstTokensPayload(enabled, [' ', '-']);
    expect(enabled).toEqual({ 'stream-fake-first-tokens': [' ', '-'] });
  });
});

describe('codex stream-fake-first-tokens serialize/normalize', () => {
  test('normalizes a space token from the backend without trimming', () => {
    const config = normalizeProviderKeyConfig({
      'api-key': 'codex-1',
      'base-url': 'https://codex.example',
      'stream-fake-first-tokens': [' ', '-', ''],
    });
    expect(config?.streamFakeFirstTokens).toEqual([' ', '-']);

    const omitted = normalizeProviderKeyConfig({
      'api-key': 'codex-2',
      'base-url': 'https://codex.example',
    });
    expect(omitted?.streamFakeFirstTokens).toBeUndefined();
  });

  test('sends the space token verbatim on create', async () => {
    const calls = stubConfigAndCapturePut([]);

    await providersApi.createCodexConfig({
      apiKey: 'codex-on',
      baseUrl: 'https://codex.example',
      streamFakeFirstTokens: [' ', '-'],
    });

    expect(putPayloads(calls)[0][0]['stream-fake-first-tokens']).toEqual([' ', '-']);
  });

  test('omits the field when the chip list is empty', async () => {
    const calls = stubConfigAndCapturePut([]);

    await providersApi.createCodexConfig({
      apiKey: 'codex-off',
      baseUrl: 'https://codex.example',
      streamFakeFirstTokens: [],
    });

    expect(putPayloads(calls)[0][0]).not.toHaveProperty('stream-fake-first-tokens');
  });

  test('clears a stored list when the form is emptied', async () => {
    const calls = stubConfigAndCapturePut([
      {
        'api-key': 'codex-stored',
        'base-url': 'https://codex.example',
        'stream-fake-first-tokens': [' ', '-'],
        'future-field': 'preserved',
      },
    ]);

    await providersApi.updateCodexConfig('codex-stored', 'https://codex.example', {
      apiKey: 'codex-stored',
      baseUrl: 'https://codex.example',
      streamFakeFirstTokens: [],
    });

    const entry = putPayloads(calls)[0][0];
    expect(entry).not.toHaveProperty('stream-fake-first-tokens');
    expect(entry['future-field']).toBe('preserved');
  });

  test('round-trips a space token through config GET normalization', () => {
    const config = normalizeConfigResponse({
      'codex-api-key': [
        {
          'api-key': 'codex-space',
          'base-url': 'https://codex.example',
          'stream-fake-first-tokens': [' '],
        },
      ],
    });
    expect(config.codexApiKeys?.[0]?.streamFakeFirstTokens).toEqual([' ']);
  });

  test('leaves a hand-written xAI value untouched', async () => {
    const calls = stubConfigAndCapturePut([
      {
        'api-key': 'xai-stored',
        'base-url': 'https://api.x.ai/v1',
        'stream-fake-first-tokens': [' '],
      },
    ]);

    await providersApi.updateXAIConfig('xai-stored', 'https://api.x.ai/v1', {
      apiKey: 'xai-stored',
      baseUrl: 'https://api.x.ai/v1',
    });

    expect(putPayloads(calls)[0][0]['stream-fake-first-tokens']).toEqual([' ']);
  });
});
