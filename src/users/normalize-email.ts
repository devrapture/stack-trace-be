export interface NormalizedEmailAddress {
  readonly displayEmail: string;
  readonly normalizedEmail: string;
}

export class InvalidEmailAddressError extends Error {
  constructor() {
    super('The email address is not supported');
    this.name = 'InvalidEmailAddressError';
    Error.captureStackTrace?.(this, InvalidEmailAddressError);
  }
}

const rejectInvalidEmail = (): never => {
  throw new InvalidEmailAddressError();
};

export const normalizeEmail = (input: string): NormalizedEmailAddress => {
  const display = input.trim().normalize('NFC');
  const at = display.lastIndexOf('@');
  if (at <= 0 || at === display.length - 1) rejectInvalidEmail();
  return Object.freeze({
    displayEmail: display,
    normalizedEmail: display.toLowerCase(),
  });
};
