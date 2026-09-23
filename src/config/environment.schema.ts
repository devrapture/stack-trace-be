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
});
