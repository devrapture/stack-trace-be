import { TransactionClient } from '../prisma/db.js';
import type { OAuthProviderName } from './oauth-state.repository.js';

export const OAUTH_LINK_CHALLENGE_REPOSITORY = Symbol(
  'OAUTH_LINK_CHALLENGE_REPOSITORY',
);

export interface ActiveOAuthLinkChallenge {
  id: string;
  provider: OAuthProviderName;
  providerSubject: string;
  otpHash: string;
  expiresAt: Date;
  attemptCount: number;
  maxAttempts: number;
}

export interface OAuthLinkChallengeRepository {
  create(input: {
    userId: string;
    provider: OAuthProviderName;
    providerSubject: string;
    otpHash: string;
    expiresAt: Date;
    maxAttempts: number;
  }): Promise<void>;

  findActiveForUser(userId: string): Promise<ActiveOAuthLinkChallenge | null>;

  incrementAttempts(challengeId: string): Promise<boolean>;

  markConsumed(challengeId: string, tx?: TransactionClient): Promise<boolean>;
}
