import { Inject, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  OAUTH_STATE_REPOSITORY,
  type OAuthStateRepository,
} from './oauth-state.repository.js';

@Injectable()
export class OAuthStateCleanupService {
  constructor(
    @Inject(OAUTH_STATE_REPOSITORY)
    private readonly stateRepository: OAuthStateRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'oauth-state-cleanup',
    waitForCompletion: true,
  })
  cleanupExpiredStates(): Promise<number> {
    return this.stateRepository.deleteExpired(new Date());
  }
}
