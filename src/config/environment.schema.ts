import Joi from 'joi';

export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ValidatedEnvironment {
  readonly NODE_ENV: NodeEnvironment;
  readonly PORT: number;
  readonly LOG_LEVEL: LogLevel;
  readonly DATABASE_URL: string;
  readonly OTP_HASH_SECRET: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM_EMAIL: string;
  readonly RESEND_FROM_NAME: string;
  readonly JWT_KID: string;
  readonly JWT_PRIVATE_KEY: string;
  readonly JWT_PUBLIC_KEY: string;
}

export const environmentSchema = Joi.object<ValidatedEnvironment>({
  NODE_ENV: Joi.string()
    .valid(...NODE_ENVIRONMENTS)
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65_535).default(3000),
  LOG_LEVEL: Joi.when('NODE_ENV', {
    switch: [
      {
        is: 'production',
        then: Joi.string().valid('info').default('info'),
      },
      {
        is: 'development',
        then: Joi.string().valid('debug').default('debug'),
      },
    ],
    otherwise: Joi.string()
      .valid(...LOG_LEVELS)
      .default('silent'),
  }),
  DATABASE_URL: Joi.string().required(),
  OTP_HASH_SECRET: Joi.string().min(32).required(),

  RESEND_API_KEY: Joi.string().trim().required(),
  RESEND_FROM_EMAIL: Joi.string().trim().email().required(),
  RESEND_FROM_NAME: Joi.string().trim().required(),
  JWT_KID: Joi.string().trim().required(),
  JWT_PRIVATE_KEY: Joi.string().trim().required(),
  JWT_PUBLIC_KEY: Joi.string().trim().required(),
});
