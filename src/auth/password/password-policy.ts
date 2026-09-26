export const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  // requireUppercase: true,
  // requireLowercase: true,
  // requireDigit: true,
  // requireSymbol: true,
} as const;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_POLICY.minLength} characters.`,
    );
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(
      `Password must be at most ${PASSWORD_POLICY.maxLength} characters.`,
    );
  }
  // if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
  //   errors.push('Password must contain at least one uppercase letter.');
  // }
  // if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
  //   errors.push('Password must contain at least one lowercase letter.');
  // }
  // if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(password)) {
  //   errors.push('Password must contain at least one digit.');
  // }
  // if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(password)) {
  //   errors.push('Password must contain at least one symbol.');
  // }

  return { valid: errors.length === 0, errors };
}
