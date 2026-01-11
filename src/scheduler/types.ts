export interface SchedulerConfig {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  enabled: true,
  hour: 2, // 02:00 UTC
  minute: 0,
};

export type JobFunction = () => Promise<void>;
