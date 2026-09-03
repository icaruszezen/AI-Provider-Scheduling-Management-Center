import { afterEach, describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { useVisualConfig } from '../src/hooks/useVisualConfig';
import { apiClient } from '../src/services/api/client';
import { providersApi } from '../src/services/api/providers';
import { normalizeConfigResponse } from '../src/services/api/transformers';
import { localCompactModeFromConfig, localCompactModeToConfig } from '../src/utils/localCompact';

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

describe('local compact mode encoding', () => {
  test('maps the three credential states', () => {
    expect(localCompactModeFromConfig(undefined)).toBe('inherit');
    expect(localCompactModeFromConfig(true)).toBe('enabled');
    expect(localCompactModeFromConfig(false)).toBe('disabled');

    expect(localCompactModeToConfig('inherit')).toBeUndefined();
    expect(localCompactModeToConfig(undefined)).toBeUndefined();
    expect(localCompactModeToConfig('enabled')).toBe(true);
    expect(localCompactModeToConfig('disabled')).toBe(false);
  });
});

describe('global local-compact switch', () => {
  test('writes the toggle into config.yaml', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.setVisualValues({ localCompact: true });
        setPhase(1);
      } else {
        return createElement(
          'pre',
          null,
          visualConfig.applyVisualChangesToYaml('local-compact: false\n')
        );
      }

      return null;
    }

    const markup = renderToStaticMarkup(createElement(Harness));
    const result = markup.slice('<pre>'.length, -'</pre>'.length);

    expect(parseYaml(result)).toEqual({ 'local-compact': true });
  });

  test('loads the toggle from config.yaml', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);

      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml('local-compact: true\n');
        setPhase(1);
      } else {
        return createElement('pre', null, String(visualConfig.visualValues.localCompact));
      }

      return null;
    }

    expect(renderToStaticMarkup(createElement(Harness))).toBe('<pre>true</pre>');
  });
});

describe('codex credential local-compact override', () => {
  test('normalizes an explicit false override from the backend', () => {
    const config = normalizeConfigResponse({
      'codex-api-key': [
        { 'api-key': 'codex-on', 'base-url': 'https://a.example', 'local-compact': true },
        { 'api-key': 'codex-off', 'base-url': 'https://b.example', 'local-compact': false },
        { 'api-key': 'codex-inherit', 'base-url': 'https://c.example' },
      ],
    });

    expect(config.codexApiKeys?.map((entry) => entry.localCompact)).toEqual([
      true,
      false,
      undefined,
    ]);
  });

  test('sends the override verbatim, including an explicit false', async () => {
    const calls = stubConfigAndCapturePut([]);

    await providersApi.createCodexConfig({
      apiKey: 'codex-on',
      baseUrl: 'https://codex.example',
      localCompact: true,
    });
    await providersApi.createCodexConfig({
      apiKey: 'codex-off',
      baseUrl: 'https://codex.example',
      localCompact: false,
    });

    const [first, second] = putPayloads(calls);
    expect(first[0]['local-compact']).toBe(true);
    expect(second[0]['local-compact']).toBe(false);
  });

  test('omits the field when the credential follows the global switch', async () => {
    const calls = stubConfigAndCapturePut([]);

    await providersApi.createCodexConfig({
      apiKey: 'codex-inherit',
      baseUrl: 'https://codex.example',
      localCompact: undefined,
    });

    expect(putPayloads(calls)[0][0]).not.toHaveProperty('local-compact');
  });

  test('clears a stored override when the credential switches back to inherit', async () => {
    const calls = stubConfigAndCapturePut([
      {
        'api-key': 'codex-stored',
        'base-url': 'https://codex.example',
        'local-compact': true,
        'future-field': 'preserved',
      },
    ]);

    await providersApi.updateCodexConfig('codex-stored', 'https://codex.example', {
      apiKey: 'codex-stored',
      baseUrl: 'https://codex.example',
      localCompact: undefined,
    });

    const entry = putPayloads(calls)[0][0];
    expect(entry).not.toHaveProperty('local-compact');
    expect(entry['future-field']).toBe('preserved');
  });

  test('leaves a hand-written xAI local-compact value untouched', async () => {
    const calls = stubConfigAndCapturePut([
      {
        'api-key': 'xai-stored',
        'base-url': 'https://api.x.ai/v1',
        'local-compact': true,
      },
    ]);

    await providersApi.updateXAIConfig('xai-stored', 'https://api.x.ai/v1', {
      apiKey: 'xai-stored',
      baseUrl: 'https://api.x.ai/v1',
    });

    expect(putPayloads(calls)[0][0]['local-compact']).toBe(true);
  });
});
