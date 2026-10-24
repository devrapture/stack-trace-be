import { IsIn } from 'class-validator';
import {
  CLIENT_TYPES,
  type SessionClientTypeName,
} from '../../sessions/session-client-type.js';

export class StartOAuthDto {
  @IsIn(CLIENT_TYPES)
  clientType: SessionClientTypeName;
}
