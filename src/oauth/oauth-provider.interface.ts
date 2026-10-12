export interface OAuthAuthorizationRequest {
  authorizationUrl: string;
  state: string;
  nonce?: string;
  pkceVerifier?: string;
}

export interface VerifiedOAuthProfile {
  providerSubject: string;
  email: string;
}

export interface OAuthProviderAdapter {
  readonly provider: 'GOOGLE' | 'GITHUB';
  createAuthorizationRequest(
    redirectUri: string,
  ): Promise<OAuthAuthorizationRequest>;
  exchangeAndVerify(input: {
    callbackUrl: URL;
    expectedState: string;
    pkceVerifier?: string;
    nonce?: string;
  }): Promise<VerifiedOAuthProfile>;
}
