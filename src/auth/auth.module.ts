import { Module } from '@nestjs/common';
import { PASSWORD_CREDENTIALS_REPOSITORY } from './password/password-credentials.repository';
import { PasswordHasher } from './password/password.hasher';
import { PrismaPasswordCredentialsRepository } from './password/prisma-password-credentials.repository';

@Module({
  providers: [
    PasswordHasher,
    {
      provide: PASSWORD_CREDENTIALS_REPOSITORY,
      useClass: PrismaPasswordCredentialsRepository,
    },
  ],
  exports: [PasswordHasher, PASSWORD_CREDENTIALS_REPOSITORY],
})
export class AuthModule {}
