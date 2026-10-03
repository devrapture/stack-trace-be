import {
  LogLevel,
  NodeEnvironment,
  ValidatedEnvironment,
} from './environment.schema.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  readonly environment: NodeEnvironment;
  readonly port: number;
  readonly logLevel: LogLevel;
  readonly otpHashSecret: string;
  readonly resendAPIKey: string;
  readonly resendFromEmail: string;
  readonly resendFromName: string;
  readonly jwtKid: string;
  readonly jwtPrivateKey: string;
  readonly jwtPublicKey: string;
}

export const createAppConfig = (environment: ValidatedEnvironment): AppConfig =>
  Object.freeze({
    environment: environment.NODE_ENV,
    port: environment.PORT,
    logLevel: environment.LOG_LEVEL,
    otpHashSecret: environment.OTP_HASH_SECRET,
    resendAPIKey: environment.RESEND_API_KEY,
    resendFromEmail: environment.RESEND_FROM_EMAIL,
    resendFromName: environment.RESEND_FROM_NAME,
    jwtKid: environment.JWT_KID,
    jwtPrivateKey: environment.JWT_PRIVATE_KEY,
    jwtPublicKey: environment.JWT_PUBLIC_KEY,
  });
