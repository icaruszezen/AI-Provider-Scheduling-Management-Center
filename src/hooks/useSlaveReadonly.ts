import { useClusterStore } from '@/stores';
import { isSlaveRole } from '@/types/cluster';

export function useSlaveReadonly(): boolean {
  return useClusterStore((state) => isSlaveRole(state.status?.role));
}
