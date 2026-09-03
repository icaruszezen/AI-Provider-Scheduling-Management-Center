import { afterEach, describe, expect, mock, test } from 'bun:test';
import i18n from '@/i18n';
import { parseApiErrorResponse } from '@/services/api/apiError';
import { localizeApiErrorMessage } from '@/services/api/apiErrorMessages';
import { clusterApi } from '@/services/api/cluster';
import { useClusterStore } from '@/stores/useClusterStore';

describe('slave_node_readonly 403 handling', () => {
  test('keeps the API code so the message can be localized', () => {
    const parsed = parseApiErrorResponse(
      { error: 'slave_node_readonly', message: 'node is a cluster slave; writes are disabled' },
      'Request failed with status code 403'
    );
    expect(parsed.apiCode).toBe('slave_node_readonly');
  });

  test('replaces the backend English detail with the translated message', () => {
    const backendDetail = 'node is a cluster slave; writes are disabled';
    const localized = localizeApiErrorMessage('slave_node_readonly', backendDetail);
    expect(localized).toBe(i18n.t('cluster.readonly'));
    expect(localized).not.toBe(backendDetail);
  });

  test('leaves unmapped and missing codes on their original message', () => {
    expect(localizeApiErrorMessage('plugin_install_failed', 'download failed')).toBe(
      'download failed'
    );
    expect(localizeApiErrorMessage(undefined, 'Network Error')).toBe('Network Error');
  });
});

describe('cluster status degradation', () => {
  afterEach(() => {
    useClusterStore.getState().clear();
    mock.restore();
  });

  test('treats a missing endpoint as standalone', async () => {
    clusterApi.getStatus = mock(() =>
      Promise.reject(Object.assign(new Error('not found'), { status: 404 }))
    );

    const status = await useClusterStore.getState().fetchStatus(true);

    expect(status?.role).toBe('standalone');
    expect(useClusterStore.getState().isSlave()).toBe(false);
    expect(useClusterStore.getState().statusUnknown).toBe(false);
  });

  test('a transient failure keeps the slave role and its write protection', async () => {
    clusterApi.getStatus = mock(() => Promise.resolve({ role: 'slave' as const }));
    await useClusterStore.getState().fetchStatus(true);
    expect(useClusterStore.getState().isSlave()).toBe(true);

    clusterApi.getStatus = mock(() =>
      Promise.reject(Object.assign(new Error('gateway timeout'), { status: 504 }))
    );
    await useClusterStore.getState().fetchStatus(true);

    // Falling back to standalone here would silently re-enable every write
    // button on a node the backend still answers 403 for.
    expect(useClusterStore.getState().isSlave()).toBe(true);
    expect(useClusterStore.getState().statusUnknown).toBe(true);
    expect(useClusterStore.getState().error).toBe('gateway timeout');
  });
});
