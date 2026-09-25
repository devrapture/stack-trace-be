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
  const local = display.slice(0, at);
  const domain = display.slice(at + 1).toLowerCase();
  return Object.freeze({
    displayEmail: display,
    normalizedEmail: `${local}@${domain}`,
  });
};
