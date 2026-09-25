export type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type UserRole = 'USER' | 'ADMIN';
export type AuthProviderName = 'PASSWORD' | 'GOOGLE' | 'GITHUB';

export type UserProfile = Readonly<{
  id: string;
  publicId: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  status: UserStatus;
  primaryEmail: Readonly<{
    display: string;
    normalized: string;
    verified: boolean;
  }> | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export interface NewUserWithEmail {
  displayName: string;
  email: string;
}
