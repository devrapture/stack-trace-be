import { Module } from '@nestjs/common';
import { PrismaUserRepository } from './prisma-users.repository.js';
import { USERS_REPOSITORY } from './users.repository.js';

@Module({
  providers: [
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUserRepository,
    },
  ],
  exports: [USERS_REPOSITORY],
})
export class UsersModule {}
