import { describe, expect, test } from 'bun:test';
import { clusterApi } from '@/services/api/cluster';
import { isSlaveRole } from '@/types/cluster';

describe('cluster role helpers', () => {
  test('isSlaveRole only matches slave', () => {
    expect(isSlaveRole('slave')).toBe(true);
    expect(isSlaveRole('master')).toBe(false);
    expect(isSlaveRole('standalone')).toBe(false);
    expect(isSlaveRole(undefined)).toBe(false);
  });
});

describe('cluster management API surface', () => {
  test('UI client exposes status, nodes, sync, patch, and remove', () => {
    expect(typeof clusterApi.getStatus).toBe('function');
    expect(typeof clusterApi.getNodes).toBe('function');
    expect(typeof clusterApi.syncNow).toBe('function');
    expect(typeof clusterApi.patch).toBe('function');
    expect(typeof clusterApi.removeNode).toBe('function');
  });
});
