import { create } from 'zustand';
import { clusterApi } from '@/services/api/cluster';
import type { ApiError } from '@/types';
import type { ClusterNode, ClusterPatch, ClusterStatus } from '@/types/cluster';
import { isSlaveRole } from '@/types/cluster';

interface ClusterStoreState {
  status: ClusterStatus | null;
  nodes: ClusterNode[];
  loading: boolean;
  error: string | null;
  /** True when the last status fetch failed, so `status` may be out of date. */
  statusUnknown: boolean;
  fetchStatus: (force?: boolean) => Promise<ClusterStatus | null>;
  fetchNodes: () => Promise<ClusterNode[]>;
  /** Pushes config to every slave and resolves with the number that failed. */
  syncNow: () => Promise<number>;
  patch: (body: ClusterPatch) => Promise<void>;
  removeNode: (nodeId: string) => Promise<void>;
  clear: () => void;
  isSlave: () => boolean;
}

let inFlightStatus: Promise<ClusterStatus | null> | null = null;

const STANDALONE_STATUS: ClusterStatus = { role: 'standalone' };

// A backend without the cluster endpoints is a standalone node, which is a known
// answer. Any other failure means the role is simply unknown, and reporting it as
// standalone would quietly drop the slave write protection.
const isMissingEndpoint = (error: unknown): boolean => {
  const status = (error as ApiError | undefined)?.status;
  return status === 404 || status === 501;
};

export const useClusterStore = create<ClusterStoreState>((set, get) => ({
  status: null,
  nodes: [],
  loading: false,
  error: null,
  statusUnknown: false,

  fetchStatus: async (force = false) => {
    if (!force && inFlightStatus) {
      return inFlightStatus;
    }
    const request = (async () => {
      set({ loading: true, error: null });
      try {
        const status = await clusterApi.getStatus();
        set({ status, loading: false, statusUnknown: false });
        return status;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load cluster status';
        if (isMissingEndpoint(error)) {
          set({ status: STANDALONE_STATUS, loading: false, error: null, statusUnknown: false });
          return STANDALONE_STATUS;
        }
        // Keep the last known role so a transient failure does not flip a slave
        // back to a writable-looking standalone node.
        set({ loading: false, error: message, statusUnknown: true });
        return get().status;
      } finally {
        inFlightStatus = null;
      }
    })();
    inFlightStatus = request;
    return request;
  },

  fetchNodes: async () => {
    try {
      const response = await clusterApi.getNodes();
      const nodes = response.nodes ?? [];
      set({ nodes });
      return nodes;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load cluster nodes';
      set({ error: message });
      return [];
    }
  },

  syncNow: async () => {
    const response = await clusterApi.syncNow();
    await get().fetchNodes();
    return response.failed ?? 0;
  },

  patch: async (body) => {
    await clusterApi.patch(body);
    await get().fetchStatus(true);
  },

  removeNode: async (nodeId) => {
    await clusterApi.removeNode(nodeId);
    await get().fetchNodes();
  },

  clear: () => {
    inFlightStatus = null;
    set({ status: null, nodes: [], loading: false, error: null, statusUnknown: false });
  },

  isSlave: () => isSlaveRole(get().status?.role),
}));
