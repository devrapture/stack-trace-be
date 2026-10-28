import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  OAUTH_LINK_CHALLENGE_REPOSITORY,
  type OAuthLinkChallengeRepository,
} from './oauth-link-challenge.repository.js';

@Injectable()
export class OAuthLinkChallengeCleanupService {
  constructor(
    @Inject(OAUTH_LINK_CHALLENGE_REPOSITORY)
    private readonly challengeRepository: OAuthLinkChallengeRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'oauth-link-challenge-cleanup',
    waitForCompletion: true,
  })
  cleanupExpiredChallenges(): Promise<number> {
    return this.challengeRepository.deleteExpired(new Date());
  }
}
