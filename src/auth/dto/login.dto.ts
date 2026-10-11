import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  CLIENT_TYPES,
  type SessionClientTypeName,
} from '../../sessions/session-client-type.js';
import type { AuthResponseDto } from './auth-response.dto.js';

export class LoginDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsString()
  password: string;

  @IsIn(CLIENT_TYPES)
  clientType: SessionClientTypeName;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName: string;
}

export type LoginResponseDto = AuthResponseDto;
