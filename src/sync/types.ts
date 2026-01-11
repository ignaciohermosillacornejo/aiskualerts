export interface SyncResult {
  tenantId: string;
  success: boolean;
  itemsSynced: number;
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface SyncProgress {
  totalTenants: number;
  completedTenants: number;
  successCount: number;
  failureCount: number;
  results: SyncResult[];
}

export interface SyncOptions {
  batchSize: number;
  delayBetweenTenants: number;
}

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  batchSize: 100,
  delayBetweenTenants: 5000,
};
