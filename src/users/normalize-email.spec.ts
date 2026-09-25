import { InvalidEmailAddressError, normalizeEmail } from './normalize-email.js';

describe('normalizeEmail', () => {
  it('trims the address and lowercases only the domain', () => {
    expect(normalizeEmail('  First.Last+Tag@EXAMPLE.COM  ')).toEqual({
      displayEmail: 'First.Last+Tag@EXAMPLE.COM',
      normalizedEmail: 'First.Last+Tag@example.com',
    });
  });

  it('normalizes Unicode to NFC before returning either address', () => {
    expect(normalizeEmail('Cafe\u0301@EXAMPLE.COM')).toEqual({
      displayEmail: 'Café@EXAMPLE.COM',
      normalizedEmail: 'Café@example.com',
    });
  });

  it.each(['', '   ', 'missing-at-sign', '@example.com', 'name@'])(
    'rejects an unsupported address: %j',
    (input) => {
      expect(() => normalizeEmail(input)).toThrow(InvalidEmailAddressError);
    },
  );
});
