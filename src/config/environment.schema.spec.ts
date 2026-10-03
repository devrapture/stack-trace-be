import { environmentSchema, NODE_ENVIRONMENTS } from './environment.schema.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://localhost/stack_trace',
  OTP_HASH_SECRET: 'a'.repeat(32),
  RESEND_API_KEY: 're_test_key',
  RESEND_FROM_EMAIL: 'noreply@example.com',
  RESEND_FROM_NAME: 'Stack Trace',
  JWT_KID: 'test-key',
  JWT_PRIVATE_KEY: 'test-private-key',
  JWT_PUBLIC_KEY: 'test-public-key',
};

const requiredVariables = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_FROM_NAME',
  'JWT_KID',
  'JWT_PRIVATE_KEY',
  'JWT_PUBLIC_KEY',
] as const;

describe('environmentSchema configuration', () => {
  it('accepts a complete configuration', () => {
    const { error, value } = environmentSchema.validate({
      ...validEnvironment,
      RESEND_FROM_NAME: '  Stack Trace  ',
    });

    expect(error).toBeUndefined();
    expect(value.RESEND_FROM_NAME).toBe('Stack Trace');
  });

  it.each(
    NODE_ENVIRONMENTS.flatMap((environment) =>
      requiredVariables.map((variable) => [environment, variable] as const),
    ),
  )('in %s, rejects a missing %s', (environment, variable) => {
    const { error } = environmentSchema.validate(
      { ...validEnvironment, NODE_ENV: environment, [variable]: undefined },
      { abortEarly: false },
    );

    expect(error?.details.map((detail) => detail.path[0])).toContain(variable);
  });

  it.each([
    ['RESEND_API_KEY', '   '],
    ['RESEND_FROM_EMAIL', '   '],
    ['RESEND_FROM_EMAIL', 'not-an-email'],
    ['RESEND_FROM_NAME', '   '],
  ] as const)('rejects invalid %s', (variable, value) => {
    const { error } = environmentSchema.validate({
      ...validEnvironment,
      [variable]: value,
    });

    expect(error?.details[0].path[0]).toBe(variable);
  });
});
