import { afterEach, describe, expect, test } from 'bun:test';
import { apiCallApi } from '../src/services/api/apiCall';
import { modelsApi } from '../src/services/api/models';

const originalApiCallRequest = apiCallApi.request;

afterEach(() => {
  apiCallApi.request = originalApiCallRequest;
});

describe('OpenAI-compatible model discovery', () => {
  test('retries /v1/models when a host-root /models endpoint returns 404', async () => {
    const requestedUrls: string[] = [];
    apiCallApi.request = (async (payload) => {
      requestedUrls.push(payload.url);
      if (payload.url.endsWith('/v1/models')) {
        return {
          statusCode: 200,
          header: {},
          bodyText: '',
          body: { data: [{ id: 'gpt-5.4' }, { id: 'claude-sonnet-4-5' }] },
        };
      }
      return { statusCode: 404, header: {}, bodyText: '', body: null };
    }) as typeof apiCallApi.request;

    const models = await modelsApi.fetchModelsViaApiCall(
      'http://bugteam.cpa.aigcpro.org',
      'test-key'
    );

    expect(requestedUrls).toEqual([
      'http://bugteam.cpa.aigcpro.org/models',
      'http://bugteam.cpa.aigcpro.org/v1/models',
    ]);
    expect(models.map((model) => model.name)).toEqual(['gpt-5.4', 'claude-sonnet-4-5']);
  });

  test('does not append a second /v1 when the base URL already includes it', async () => {
    const requestedUrls: string[] = [];
    apiCallApi.request = (async (payload) => {
      requestedUrls.push(payload.url);
      return {
        statusCode: 200,
        header: {},
        bodyText: '',
        body: { data: [{ id: 'kimi-k2.5' }] },
      };
    }) as typeof apiCallApi.request;

    await modelsApi.fetchModelsViaApiCall('https://api.moonshot.ai/v1', 'test-key');

    expect(requestedUrls).toEqual(['https://api.moonshot.ai/v1/models']);
  });

  test('surfaces non-404 errors from /models without trying /v1/models', async () => {
    const requestedUrls: string[] = [];
    apiCallApi.request = (async (payload) => {
      requestedUrls.push(payload.url);
      return {
        statusCode: 401,
        header: {},
        bodyText: '',
        body: { error: 'Missing API key' },
      };
    }) as typeof apiCallApi.request;

    await expect(
      modelsApi.fetchModelsViaApiCall('http://upstream.example', 'test-key')
    ).rejects.toThrow('401 Missing API key');
    expect(requestedUrls).toEqual(['http://upstream.example/models']);
  });
});
