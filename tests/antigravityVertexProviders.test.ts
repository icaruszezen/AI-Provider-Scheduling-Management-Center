import { describe, expect, test } from 'bun:test';
import { normalizeConfigResponse, normalizeProviderKeyConfig } from '../src/services/api/transformers';
import { PROVIDER_BRAND_ORDER, PROVIDER_DESCRIPTORS } from '../src/features/providers/descriptors';
import { antigravityToResource, vertexToResource } from '../src/features/providers/adapters';
import { getProviderKeyCounts } from '../src/features/dashboard/hooks/useDashboardOverview';

describe('Antigravity provider wiring', () => {
  test('is a first-class workbench brand after Vertex', () => {
    expect(PROVIDER_BRAND_ORDER).toContain('antigravity');
    expect(PROVIDER_BRAND_ORDER.indexOf('antigravity')).toBe(
      PROVIDER_BRAND_ORDER.indexOf('vertex') + 1
    );
    expect(PROVIDER_DESCRIPTORS.antigravity.supportsApiKey).toBe(true);
    expect(PROVIDER_DESCRIPTORS.antigravity.supportsModels).toBe(false);
  });

  test('normalizes antigravity-api-key including project-id', () => {
    const config = normalizeConfigResponse({
      'antigravity-api-key': [
        { 'api-key': 'ag-key', 'project-id': 'proj-1', prefix: 'ag' },
      ],
    });
    expect(config.antigravityApiKeys).toEqual([
      { apiKey: 'ag-key', projectId: 'proj-1', prefix: 'ag' },
    ]);
    const resource = antigravityToResource(config.antigravityApiKeys![0], 0);
    expect(resource.brand).toBe('antigravity');
    expect(resource.selector).toMatchObject({ brand: 'antigravity', apiKey: 'ag-key', index: 0 });
  });

  test('counts Antigravity keys on the dashboard', () => {
    const counts = getProviderKeyCounts({
      geminiApiKeys: [{ apiKey: 'g' }],
      antigravityApiKeys: [{ apiKey: 'a', projectId: 'p' }],
    });
    expect(counts.antigravity).toBe(1);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(2);
  });
});

describe('Vertex service-account credentials', () => {
  test('keeps official Vertex entries that have no api-key', () => {
    const sa = {
      client_email: 'sa@project.iam.gserviceaccount.com',
      project_id: 'proj-sa',
      type: 'service_account',
    };
    const parsed = normalizeProviderKeyConfig({
      'api-key': '',
      'service-account': sa,
      'project-id': 'override-proj',
      location: 'us-central1',
      email: 'display@example.com',
    });
    expect(parsed).toEqual({
      apiKey: '',
      serviceAccount: sa,
      projectId: 'override-proj',
      location: 'us-central1',
      email: 'display@example.com',
    });

    const resource = vertexToResource(parsed!, 0);
    expect(resource.identifier).toBe('display@example.com');
    expect(resource.apiKey).toBeNull();
    expect(resource.selector).toMatchObject({ brand: 'vertex', apiKey: '', index: 0 });
  });

  test('still drops empty Vertex rows without a service account', () => {
    expect(normalizeProviderKeyConfig({ 'api-key': '', 'project-id': 'only-project' })).toBeNull();
  });
});
