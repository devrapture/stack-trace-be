import { FieldOutputTypes } from '../prisma/contract.js';
import type { SessionClientTypeName } from '../sessions/session-client-type.js';

export const OAUTH_STATE_REPOSITORY = Symbol('OAUTH_STATE_REPOSITORY');

export type OAuthProviderName = 'GOOGLE' | 'GITHUB';
export type OAuthIntentName = 'LOGIN' | 'LINK';

export interface CreateOAuthStateInput {
  provider: OAuthProviderName;
  intent: OAuthIntentName;
  state: string;
  nonce?: string;
  pkceVerifier?: string;
  redirectUri: string;
  clientType: SessionClientTypeName;
  linkingUserId?: string;
  expiresAt: Date;
}

export type OAuthStateField = FieldOutputTypes['public']['OAuthState'];

export type OAuthStateRecord = Readonly<
  Pick<
    OAuthStateField,
    | 'id'
    | 'provider'
    | 'intent'
    | 'nonce'
    | 'pkceVerifier'
    | 'redirectUri'
    | 'clientType'
    | 'linkingUserId'
  > & {
    expiresAt: Date;
    consumedAt: Date | null;
  }
>;

export interface OAuthStateRepository {
  create(input: CreateOAuthStateInput): Promise<void>;
  consume(state: string): Promise<OAuthStateRecord | null>;
}
