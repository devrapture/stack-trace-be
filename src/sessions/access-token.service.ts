import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export interface AccessTokenClaims {
  sub: string;
  sid: string;
}

@Injectable()
export class AccessTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async sign(claims: AccessTokenClaims): Promise<string> {
    return this.jwtService.signAsync(claims, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    return this.jwtService.verifyAsync<AccessTokenClaims>(token);
  }
}
