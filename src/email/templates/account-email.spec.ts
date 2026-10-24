import {
  accountEmail,
  existingAccountNoticeEmail,
  oauthOnlyAccountNoticeEmail,
  unverifiedAccountPasswordResetNoticeEmail,
} from './account-email.js';

describe('accountEmail', () => {
  it.each(['registration_otp', 'password_reset_otp'] as const)(
    'includes the code and expiry for %s',
    (type) => {
      const email = accountEmail({ type, otp: '012345', expiresInMinutes: 10 });

      for (const body of [email.html, email.text]) {
        expect(body).toContain('012345');
        expect(body).toContain('10 minutes');
        expect(body).toContain('devrapture@proton.me');
      }
    },
  );

  it('uses registration instructions and welcome content', () => {
    const email = accountEmail({
      type: 'registration_otp',
      otp: '123456',
      expiresInMinutes: 1,
    });

    expect(email.subject).toBe('Verify your email to join Stack Trace');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('registration screen');
      expect(body).toContain('daily word-search game');
      expect(body).toContain('1 minute');
      expect(body).not.toContain('1 minutes');
    }
  });

  it('uses reset instructions without registration content', () => {
    const email = accountEmail({
      type: 'password_reset_otp',
      otp: '123456',
      expiresInMinutes: 5,
    });

    expect(email.subject).toBe('Reset your Stack Trace password');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('password reset screen');
      expect(body).toContain('Your password will stay the same.');
      expect(body).not.toContain('registration screen');
      expect(body).not.toContain('Welcome to Stack Trace');
    }
  });

  it('renders an OAuth link challenge with the provider, code, and expiry', () => {
    const email = accountEmail({
      type: 'oauth_link_challenge_otp',
      provider: 'GitHub',
      otp: '654321',
      expiresInMinutes: 10,
    });

    expect(email.subject).toBe(
      'Confirm linking your GitHub account to Stack Trace',
    );
    for (const body of [email.html, email.text]) {
      expect(body).toContain('GitHub');
      expect(body).toContain('654321');
      expect(body).toContain('10 minutes');
      expect(body).toContain('nothing will be linked');
    }
  });

  it('renders a password change notification without a code or expiry', () => {
    const email = accountEmail({ type: 'password_changed' });

    expect(email.subject).toBe('Your Stack Trace password was changed');
    expect(email.html).not.toContain('class="otp"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('changed successfully');
      expect(body).toContain('reset it immediately');
      expect(body).not.toMatch(/expires|copy the code|registration screen/i);
    }
  });

  it.each([
    {
      render: existingAccountNoticeEmail,
      subject: 'Someone tried to register with your email',
      instructions: 'sign in to your existing Stack Trace account instead',
    },
    {
      render: oauthOnlyAccountNoticeEmail,
      subject: 'This email is already linked to a Stack Trace account',
      instructions: 'sign in with the Google or GitHub provider',
    },
  ])(
    'renders the account notice: $subject',
    ({ render, subject, instructions }) => {
      const email = render();

      expect(email.subject).toBe(subject);
      expect(email.html).not.toContain('class="otp"');
      for (const body of [email.html, email.text]) {
        expect(body).toContain(instructions);
        expect(body).toContain('no action is needed');
        expect(body).toContain('Your account is unaffected');
        expect(body).toContain('devrapture@proton.me');
        expect(body).not.toMatch(/expires|copy the code|reset it immediately/i);
      }
    },
  );

  it('renders an unverified-account password-reset notice without a code', () => {
    const email = unverifiedAccountPasswordResetNoticeEmail();

    expect(email.subject).toBe(
      'Verify your email before resetting your password',
    );
    expect(email.html).not.toContain('class="otp"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain(
        'email address on the account has not been verified',
      );
      expect(body).toContain('request a new verification code');
      expect(body).toContain('No changes have been made to your account');
      expect(body).not.toMatch(/expires|copy the code/i);
    }
  });

  it('renders a provider-linked notice', () => {
    const email = accountEmail({
      type: 'provider_linked',
      provider: 'GitHub',
    });

    expect(email.subject).toBe('GitHub linked to your Stack Trace account');
    expect(email.html).not.toContain('class="otp"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('GitHub account is now linked');
      expect(body).toContain('sign in with it going forward');
      expect(body).toContain('linked sign-in methods immediately');
      expect(body).not.toMatch(/expires|copy the code/i);
    }
    expect(email.text).toContain("If this wasn't you");
    expect(email.html).toContain('If this wasn&#39;t you');
  });

  it('renders a provider-unlinked notice', () => {
    const email = accountEmail({
      type: 'provider_unlinked',
      provider: 'GitHub',
    });

    expect(email.subject).toBe('GitHub unlinked from your Stack Trace account');
    expect(email.html).not.toContain('class="otp"');
    for (const body of [email.html, email.text]) {
      expect(body).toContain('GitHub account has been unlinked');
      expect(body).toContain('can no longer be used to sign in');
      expect(body).toContain('sign in with your remaining method');
      expect(body).toContain('review your account');
      expect(body).not.toMatch(/expires|copy the code/i);
    }
    expect(email.text).toContain("If this wasn't you");
    expect(email.html).toContain('If this wasn&#39;t you');
  });

  it('escapes names and codes in HTML while preserving plain text', () => {
    const email = accountEmail({
      type: 'registration_otp',
      name: ' <Guest & "friend"> ',
      otp: '<123456>',
      expiresInMinutes: 10,
    });

    expect(email.html).toContain('Hi &lt;Guest &amp; &quot;friend&quot;&gt;,');
    expect(email.html).toContain('&lt;123456&gt;');
    expect(email.html).not.toContain('<Guest');
    expect(email.text).toContain('Hi <Guest & "friend">,');
    expect(email.text).toContain('<123456>');
  });

  it('uses a friendly fallback for a blank name', () => {
    const email = accountEmail({ type: 'password_changed', name: '   ' });

    expect(email.html).toContain('Hi there,');
    expect(email.text).toContain('Hi there,');
  });

  it.each([0, -1, NaN, Infinity])(
    'rejects invalid OTP expiry: %s',
    (expiry) => {
      expect(() =>
        accountEmail({
          type: 'password_reset_otp',
          otp: '123456',
          expiresInMinutes: expiry,
        }),
      ).toThrow(RangeError);
    },
  );
});
