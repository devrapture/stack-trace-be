import { TransactionClient } from '../prisma/db.js';
import { OAuthProviderName } from './oauth-state.repository.js';

export const OAUTH_IDENTITIES_REPOSITORY = Symbol(
  'OAUTH_IDENTITIES_REPOSITORY',
);

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
}
