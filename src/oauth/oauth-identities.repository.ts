import { TransactionClient } from '../prisma/db.js';
import { OAuthProviderName } from './oauth-state.repository.js';

export const OAUTH_IDENTITIES_REPOSITORY = Symbol(
  'OAUTH_IDENTITIES_REPOSITORY',
);

export class OAuthProviderAlreadyLinkedError extends Error {
  constructor() {
    super('This user already has an identity for this OAuth provider.');
    this.name = 'OAuthProviderAlreadyLinkedError';
    Error.captureStackTrace?.(this, OAuthProviderAlreadyLinkedError);
  }
}

export class OAuthIdentityAlreadyLinkedError extends Error {
  constructor() {
    super('This OAuth identity is already linked to a user.');
    this.name = 'OAuthIdentityAlreadyLinkedError';
    Error.captureStackTrace?.(this, OAuthIdentityAlreadyLinkedError);
  }
}

export interface LinkedOAuthIdentity {
  provider: OAuthProviderName;
  providerSubject: string;
  createdAt: Date;
}
export interface OAuthIdentitiesRepository {
  findUserIdByProviderSubject(
    provider: OAuthProviderName,
    providerSubject: string,
    tx?: TransactionClient,
  ): Promise<string | null>;

  createForUser(
    userId: string,
    provider: OAuthProviderName,
    providerSubject: string,
    tx?: TransactionClient,
  ): Promise<void>;

  listForUser(
    userId: string,
    tx?: TransactionClient,
  ): Promise<LinkedOAuthIdentity[]>;

  deleteForUser(
    userId: string,
    provider: OAuthProviderName,
    tx?: TransactionClient,
  ): Promise<void>;
}
