import { apiClient } from './client';
import type {
  ClusterNodesResponse,
  ClusterPatch,
  ClusterStatus,
  ClusterSyncResponse,
} from '@/types/cluster';

export const clusterApi = {
  getStatus: () => apiClient.get<ClusterStatus>('/cluster'),
  getNodes: () => apiClient.get<ClusterNodesResponse>('/cluster/nodes'),
  syncNow: () => apiClient.post<ClusterSyncResponse>('/cluster/sync'),
  patch: (body: ClusterPatch) => apiClient.patch<{ status: string }>('/cluster', body),
  removeNode: (nodeId: string) => apiClient.delete<{ status: string }>(`/cluster/nodes/${nodeId}`),
};
