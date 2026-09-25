import { InvalidEmailAddressError, normalizeEmail } from './normalize-email.js';

describe('normalizeEmail', () => {
  it('trims the address and lowercases the complete lookup key', () => {
    expect(normalizeEmail('  First.Last+Tag@EXAMPLE.COM  ')).toEqual({
      displayEmail: 'First.Last+Tag@EXAMPLE.COM',
      normalizedEmail: 'first.last+tag@example.com',
    });
  });

  it('normalizes Unicode to NFC before returning either address', () => {
    expect(normalizeEmail('Cafe\u0301@EXAMPLE.COM')).toEqual({
      displayEmail: 'Café@EXAMPLE.COM',
      normalizedEmail: 'café@example.com',
    });
  });

  it.each(['', '   ', 'missing-at-sign', '@example.com', 'name@'])(
    'rejects an unsupported address: %j',
    (input) => {
      expect(() => normalizeEmail(input)).toThrow(InvalidEmailAddressError);
    },
  );
});
