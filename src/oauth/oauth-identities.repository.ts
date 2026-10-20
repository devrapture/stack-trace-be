import { TransactionClient } from '../prisma/db.js';
import { OAuthProviderName } from './oauth-state.repository.js';

export const OAUTH_IDENTITIES_REPOSITORY = Symbol(
  'OAUTH_IDENTITIES_REPOSITORY',
);
export interface LinkedOAuthIdentity {
  provider: OAuthProviderName;
  providerSubject: string;
  createdAt: Date;
}
export interface OAuthIdentitiesRepository {
  findUserIdByProviderSubject(
    provider: OAuthProviderName,
    providerSubject: string,
  ): Promise<string | null>;

  createForUser(
    userId: string,
    provider: OAuthProviderName,
    providerSubject: string,
    tx?: TransactionClient,
  ): Promise<void>;

  listForUser(userId: string): Promise<LinkedOAuthIdentity[]>;

  deleteForUser(
    userId: string,
    provider: OAuthProviderName,
    tx?: TransactionClient,
  ): Promise<void>;
}
