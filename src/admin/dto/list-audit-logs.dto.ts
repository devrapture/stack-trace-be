import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListAuditLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface AuditLogEntryDto {
  id: string;
  userId: string | null;
  actorUserId: string | null;
  eventType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
