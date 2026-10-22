import { IsEmail, IsIn, Matches } from 'class-validator';
import { CLIENT_TYPES } from '../../sessions/session-client-type.js';

export class ConfirmLinkDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'otp must be exactly 6 digits' })
  otp: string;

  @IsIn(CLIENT_TYPES)
  clientType: (typeof CLIENT_TYPES)[number];
}
