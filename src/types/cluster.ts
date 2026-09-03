export type ClusterRole = 'standalone' | 'master' | 'slave';

export type ClusterNodeStatusCode = 'online' | 'stale' | 'error';

export interface ClusterStatus {
  role: ClusterRole;
  node_id?: string;
  token_configured?: boolean;
  master_url?: string;
  advertise_url?: string;
  applied_hash?: string;
  last_sync_at?: string | null;
  last_error?: string;
  sync_interval_seconds?: number;
  heartbeat_interval_seconds?: number;
}

export interface ClusterNode {
  node_id: string;
  advertise_url?: string;
  hostname?: string;
  cpa_version?: string;
  applied_hash?: string;
  auth_file_count?: number;
  uptime_seconds?: number;
  last_seen?: string;
  last_error?: string;
  status?: ClusterNodeStatusCode;
}

export interface ClusterNodesResponse {
  nodes?: ClusterNode[];
}

export type ClusterPushStatus = 'pushed' | 'skipped' | 'failed';

export interface ClusterPushResult {
  node_id: string;
  advertise_url?: string;
  status: ClusterPushStatus;
  error?: string;
}

export interface ClusterSyncResponse {
  status: string;
  failed?: number;
  nodes?: ClusterPushResult[];
}

export interface ClusterPatch {
  role?: ClusterRole;
  token?: string;
  master_url?: string;
  advertise_url?: string;
  sync_interval_seconds?: number;
  heartbeat_interval_seconds?: number;
}

export const isSlaveRole = (role?: string | null): boolean => role === 'slave';
