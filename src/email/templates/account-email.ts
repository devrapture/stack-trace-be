import type { EmailMessage } from '../email-provider.js';

interface AccountEmailBaseOptions {
  name?: string;
}

export type AccountEmailOptions = AccountEmailBaseOptions &
  (
    | {
        type: 'registration_otp' | 'password_reset_otp';
        otp: string;
        expiresInMinutes: number;
        provider?: never;
      }
    | {
        type: 'oauth_link_challenge_otp';
        provider: string;
        otp: string;
        expiresInMinutes: number;
      }
    | {
        type:
          | 'password_changed'
          | 'existing_account_notice'
          | 'oauth_only_account_notice'
          | 'unverified_account_password_reset_notice';
        otp?: never;
        expiresInMinutes?: never;
      }
    | {
        type: 'provider_linked' | 'provider_unlinked';
        provider: string;
        otp?: never;
        expiresInMinutes?: never;
      }
  );

const CONTACT_EMAIL = 'devrapture@proton.me';

interface AccountEmailContent {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  paragraphs: string[];
  actionHeading: string;
  instructions: string;
  codeLabel?: string;
  securityNote: string;
  closing: string;
  footer: string;
}

const CONTENT = {
  registration_otp: {
    subject: 'Verify your email to join Stack Trace',
    preheader:
      'Your registration code is ready. Verify your email and get ready for your daily word search.',
    eyebrow: 'ONE PUZZLE. EVERY DAY.',
    headline: 'Your next find starts here.',
    paragraphs: [
      'Welcome to Stack Trace, a daily word-search game for software engineers. A short puzzle, a fresh theme, and a grid full of terms you know.',
      'Git commands. Database concepts. JavaScript keywords. Take a little break and see what you can find.',
    ],
    actionHeading: 'First, verify your email.',
    instructions:
      'Enter this code on the registration screen to finish creating your account.',
    codeLabel: 'YOUR VERIFICATION CODE',
    securityNote:
      'Never share this code with anyone. If you didn’t sign up for Stack Trace, you can safely ignore this email.',
    closing: 'See you in the grid,',
    footer:
      'You received this email because this address was used to register for Stack Trace.',
  },
  password_reset_otp: {
    subject: 'Reset your Stack Trace password',
    preheader:
      'Use your password reset code to choose a new Stack Trace password.',
    eyebrow: 'ACCOUNT RECOVERY',
    headline: 'Let’s get you back in.',
    paragraphs: [
      'We received a request to reset the password for your Stack Trace account.',
    ],
    actionHeading: 'Choose a fresh password.',
    instructions:
      'Enter this code on the password reset screen to continue and choose a new password.',
    codeLabel: 'YOUR PASSWORD RESET CODE',
    securityNote:
      'Never share this code with anyone. If you didn’t request a password reset, you can safely ignore this email. Your password will stay the same.',
    closing: 'See you back in the grid,',
    footer:
      'You received this email because a password reset was requested for your Stack Trace account.',
  },
  password_changed: {
    subject: 'Your Stack Trace password was changed',
    preheader:
      'Your password has been updated. If this wasn’t you, contact us immediately.',
    eyebrow: 'ACCOUNT SECURITY',
    headline: 'Your password is updated.',
    paragraphs: [
      'The password for your Stack Trace account has been changed successfully.',
    ],
    actionHeading: 'Was this you?',
    instructions:
      'If you made this change, you’re all set. Use your new password the next time you sign in.',
    securityNote:
      'If you didn’t change your password, reset it immediately through Stack Trace and contact us for help.',
    closing: 'Take care,',
    footer:
      'You received this security notification because the password for your Stack Trace account was changed.',
  },
  existing_account_notice: {
    subject: 'Someone tried to register with your email',
    preheader:
      'You already have a Stack Trace account. This registration attempt hasn’t changed it.',
    eyebrow: 'ACCOUNT NOTICE',
    headline: 'You already have a place in the grid.',
    paragraphs: [
      'Someone just tried to create a Stack Trace account using this email address, which already has an account.',
    ],
    actionHeading: 'Was this you?',
    instructions:
      'If this was you, sign in to your existing Stack Trace account instead.',
    securityNote:
      'If this wasn’t you, no action is needed. Your account is unaffected by this registration attempt.',
    closing: 'See you in the grid,',
    footer:
      'You received this notice because someone tried to register for Stack Trace using the email address on your existing account.',
  },
  oauth_only_account_notice: {
    subject: 'This email is already linked to a Stack Trace account',
    preheader:
      'Use your existing Google or GitHub sign-in to return to Stack Trace.',
    eyebrow: 'ACCOUNT NOTICE',
    headline: 'Your account is already here.',
    paragraphs: [
      'Someone just tried to register a password account with this email address. This email is already linked to a Stack Trace account signed in via Google or GitHub.',
    ],
    actionHeading: 'Use your usual sign-in.',
    instructions:
      'If this was you, sign in with the Google or GitHub provider you used to create your Stack Trace account.',
    securityNote:
      'If this wasn’t you, no action is needed. Your account is unaffected by this registration attempt.',
    closing: 'See you in the grid,',
    footer:
      'You received this notice because someone tried to register a password account using the email address linked to your Stack Trace account.',
  },
  unverified_account_password_reset_notice: {
    subject: 'Verify your email before resetting your password',
    preheader:
      'Your Stack Trace email must be verified before you can reset your password.',
    eyebrow: 'ACCOUNT RECOVERY',
    headline: 'Your email still needs verification.',
    paragraphs: [
      'We received a request to reset the password for your Stack Trace account, but the email address on the account has not been verified yet.',
    ],
    actionHeading: 'Verify your email first.',
    instructions:
      'Return to Stack Trace and request a new verification code. After verifying your email, you can request a password reset again.',
    securityNote:
      'If you didn’t request a password reset, you can safely ignore this email. No changes have been made to your account.',
    closing: 'See you in the grid,',
    footer:
      'You received this notice because a password reset was requested for an unverified Stack Trace account using this email address.',
  },
} satisfies Record<
  Exclude<
    AccountEmailOptions['type'],
    'oauth_link_challenge_otp' | 'provider_linked' | 'provider_unlinked'
  >,
  AccountEmailContent
>;

const oauthLinkChallengeOtpContent = (
  provider: string,
): AccountEmailContent => ({
  subject: `Confirm linking your ${provider} account to Stack Trace`,
  preheader: `Use your confirmation code to link your ${provider} account to Stack Trace.`,
  eyebrow: 'ACCOUNT SECURITY',
  headline: `Confirm your ${provider} sign-in.`,
  paragraphs: [
    `Someone just tried to sign in to Stack Trace with ${provider} using this email address.`,
  ],
  actionHeading: `Link your ${provider} account.`,
  instructions: `If this was you and you'd like to link your ${provider} account, enter this code in Stack Trace.`,
  codeLabel: 'YOUR ACCOUNT LINK CODE',
  securityNote:
    "Never share this code with anyone. If this wasn't you, you can safely ignore this email — nothing will be linked.",
  closing: 'Take care,',
  footer: `You received this security notification because someone tried to link a ${provider} sign-in method to your Stack Trace account.`,
});

const providerLinkedContent = (provider: string): AccountEmailContent => ({
  subject: `${provider} linked to your Stack Trace account`,
  preheader: `Your ${provider} account is now linked to Stack Trace.`,
  eyebrow: 'ACCOUNT SECURITY',
  headline: `${provider} is now linked.`,
  paragraphs: [
    `Your ${provider} account is now linked — you can sign in with it going forward.`,
  ],
  actionHeading: 'Was this you?',
  instructions: `If you linked your ${provider} account, you’re all set.`,
  securityNote:
    "If this wasn't you, remove it from your account's linked sign-in methods immediately.",
  closing: 'Take care,',
  footer: `You received this security notification because a ${provider} sign-in method was linked to your Stack Trace account.`,
});

const providerUnlinkedContent = (provider: string): AccountEmailContent => ({
  subject: `${provider} unlinked from your Stack Trace account`,
  preheader: `Your ${provider} account has been unlinked from Stack Trace.`,
  eyebrow: 'ACCOUNT SECURITY',
  headline: `${provider} is no longer linked.`,
  paragraphs: [
    `Your ${provider} account has been unlinked and can no longer be used to sign in.`,
  ],
  actionHeading: 'Was this you?',
  instructions: `If you unlinked your ${provider} account, no further action is needed.`,
  securityNote:
    "If this wasn't you, sign in with your remaining method and review your account.",
  closing: 'Take care,',
  footer: `You received this security notification because a ${provider} sign-in method was unlinked from your Stack Trace account.`,
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export const accountEmail = (
  options: AccountEmailOptions,
): Pick<EmailMessage, 'subject' | 'text'> & {
  html: string;
} => {
  const content: AccountEmailContent =
    options.type === 'oauth_link_challenge_otp'
      ? oauthLinkChallengeOtpContent(options.provider)
      : options.type === 'provider_linked'
        ? providerLinkedContent(options.provider)
        : options.type === 'provider_unlinked'
          ? providerUnlinkedContent(options.provider)
          : CONTENT[options.type];
  const greeting = options.name?.trim()
    ? `Hi ${options.name.trim()},`
    : 'Hi there,';
  let otpHtml = '';
  let otpText = '';

  if (
    options.type === 'registration_otp' ||
    options.type === 'password_reset_otp' ||
    options.type === 'oauth_link_challenge_otp'
  ) {
    const { otp, expiresInMinutes } = options;
    if (!Number.isFinite(expiresInMinutes) || expiresInMinutes <= 0) {
      throw new RangeError('expiresInMinutes must be a positive number');
    }
    const expiry = `${expiresInMinutes} ${expiresInMinutes === 1 ? 'minute' : 'minutes'}`;
    otpText = `${otp}\n\nThis code expires in ${expiry}. Copy just the code, then return to Stack Trace to enter it.`;
    otpHtml = `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#f5f2ff" style="padding: 24px 12px; border: 1px solid #e4dcfb; border-radius: 12px;">
                      <p style="margin: 0 0 12px; color: #6b50d6; font-size: 11px; line-height: 16px; font-weight: bold; letter-spacing: 2px;">${escapeHtml(content.codeLabel ?? '')}</p>
                      <p class="otp" style="margin: 0; color: #26203f; font-family: 'Courier New', Courier, monospace; font-size: 38px; line-height: 48px; font-weight: bold; letter-spacing: 8px; user-select: all;">${escapeHtml(otp)}</p>
                      <p style="margin: 12px 0 0; color: #636078; font-size: 13px; line-height: 20px;">Expires in ${expiry}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin: 12px 0 24px; text-align: center; color: #73788b; font-size: 12px; line-height: 20px;">Select and copy the code, then return to Stack Trace.</p>`;
  }

  return {
    subject: content.subject,
    text: [
      greeting,
      content.headline,
      ...content.paragraphs,
      content.actionHeading,
      content.instructions,
      otpText,
      content.securityNote,
      `Need a hand? Contact ${CONTACT_EMAIL}.`,
      `${content.closing}\nThe Stack Trace team`,
      content.footer,
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.subject)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .outer-padding { padding: 20px 12px !important; }
        .card-padding { padding: 30px 24px !important; }
        .header-padding { padding: 22px 24px !important; }
        .headline { font-size: 28px !important; line-height: 36px !important; }
        .otp { font-size: 32px !important; letter-spacing: 6px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f0eef8; color: #48516a; font-family: Arial, Helvetica, sans-serif; -webkit-text-size-adjust: 100%;">
    <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(content.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f0eef8">
      <tr>
        <td align="center" class="outer-padding" style="padding: 40px 20px;">
          <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px;">
            <tr>
              <td class="header-padding" bgcolor="#ffffff" style="padding: 26px 36px; border-radius: 14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="46" valign="middle">
                      <span style="display: inline-block; padding: 10px 8px; border-radius: 10px; background-color: #ede9ff; color: #6b50d6; font-family: 'Courier New', monospace; font-size: 20px; font-weight: bold;">&gt;_</span>
                    </td>
                    <td valign="middle" style="padding-left: 12px; color: #141629; font-size: 23px; font-weight: bold; letter-spacing: -0.5px;">Stack Trace</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td height="24" style="font-size: 0; line-height: 24px;">&nbsp;</td></tr>
            <tr>
              <td class="card-padding" bgcolor="#ffffff" style="padding: 40px 36px; border-radius: 14px;">
                <p style="margin: 0 0 16px; color: #6b50d6; font-size: 11px; line-height: 18px; font-weight: bold; letter-spacing: 2px;">${escapeHtml(content.eyebrow)}</p>
                <h1 class="headline" style="margin: 0 0 22px; color: #141629; font-size: 34px; line-height: 42px; letter-spacing: -1px;">${escapeHtml(content.headline)}</h1>
                <p style="margin: 0 0 16px; font-size: 16px; line-height: 26px;">${escapeHtml(greeting)}</p>
                ${content.paragraphs.map((paragraph) => `<p style="margin: 0 0 24px; font-size: 16px; line-height: 26px;">${escapeHtml(paragraph)}</p>`).join('\n                ')}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top: 1px solid #eeedf4;">
                  <tr>
                    <td style="padding-top: 26px;">
                      <h2 style="margin: 0 0 12px; color: #141629; font-size: 20px; line-height: 28px;">${escapeHtml(content.actionHeading)}</h2>
                      <p style="margin: 0 0 20px; font-size: 16px; line-height: 26px;">${escapeHtml(content.instructions)}</p>
                    </td>
                  </tr>
                </table>
                ${otpHtml}
                <p style="margin: 0 0 24px; color: #73788b; font-size: 13px; line-height: 22px;">${escapeHtml(content.securityNote)}</p>
                <p style="margin: 0 0 24px; font-size: 14px; line-height: 24px;">Need a hand? Say hello at<br /><a href="mailto:${CONTACT_EMAIL}" style="color: #6b50d6; font-weight: bold; text-decoration: underline;">${CONTACT_EMAIL}</a>.</p>
                <p style="margin: 0; font-size: 15px; line-height: 25px;">${escapeHtml(content.closing)}<br /><strong style="color: #141629;">The Stack Trace team</strong></p>
              </td>
            </tr>
            <tr><td height="24" style="font-size: 0; line-height: 24px;">&nbsp;</td></tr>
            <tr>
              <td align="center" bgcolor="#141629" style="padding: 30px 24px; border-radius: 14px;">
                <p style="margin: 0 0 12px; color: #ffffff; font-size: 21px; line-height: 28px; font-weight: bold;"><span style="color: #b7a4ff; font-family: 'Courier New', monospace;">&gt;_</span>&nbsp; Stack Trace</p>
                <p style="margin: 0 0 20px; color: #c4bdd9; font-size: 13px; line-height: 22px;">A small puzzle. A familiar language. A daily reset.</p>
                <p style="margin: 0; color: #a3a1b6; font-size: 11px; line-height: 18px;">${escapeHtml(content.footer)}</p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
};

export const existingAccountNoticeEmail = () =>
  accountEmail({ type: 'existing_account_notice' });

export const oauthOnlyAccountNoticeEmail = () =>
  accountEmail({ type: 'oauth_only_account_notice' });

export const unverifiedAccountPasswordResetNoticeEmail = () =>
  accountEmail({ type: 'unverified_account_password_reset_notice' });
