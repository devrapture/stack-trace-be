import { FieldOutputTypes } from '../prisma/contract.js';
import type { SessionClientTypeName } from '../sessions/session-client-type.js';

export const OAUTH_STATE_REPOSITORY = Symbol('OAUTH_STATE_REPOSITORY');

export type OAuthProviderName = 'GOOGLE' | 'GITHUB';
export type OAuthIntentName = 'LOGIN' | 'LINK';

interface CreateOAuthStateBase {
  provider: OAuthProviderName;
  state: string;
  nonce?: string;
  pkceVerifier?: string;
  redirectUri: string;
  clientType: SessionClientTypeName;
  expiresAt: Date;
}

export type CreateOAuthStateInput = CreateOAuthStateBase &
  (
    | {
        intent: 'LOGIN';
        linkingUserId?: never;
        linkingSessionId?: never;
      }
    | {
        intent: 'LINK';
        linkingUserId: string;
        linkingSessionId: string;
      }
  );

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
    | 'linkingSessionId'
  > & {
    expiresAt: Date;
    consumedAt: Date | null;
  }
>;

export interface OAuthStateRepository {
  create(input: CreateOAuthStateInput): Promise<void>;
  consume(state: string): Promise<OAuthStateRecord | null>;
  deleteExpired(before: Date): Promise<number>;
}
