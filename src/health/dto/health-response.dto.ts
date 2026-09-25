export type HealthCheckState = 'up' | 'down';
export type HealthChecks = Readonly<Record<string, HealthCheckState>>;

export interface HealthResponse {
  readonly status: 'ok' | 'unavailable';
  readonly service: 'stack-trace-api';
  readonly checked_at: string;
  readonly uptime_seconds: number;
  readonly checks: HealthChecks;
}

export class HealthResponseDto implements HealthResponse {
  constructor(
    readonly status: 'ok' | 'unavailable',
    readonly service: 'stack-trace-api',
    readonly checked_at: string,
    readonly uptime_seconds: number,
    readonly checks: HealthChecks,
  ) {}
}
