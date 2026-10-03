import { createHash, randomBytes } from 'crypto';

export const generateRefreshToken = (): string =>
  randomBytes(32).toString('base64url');

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
