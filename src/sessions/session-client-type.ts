export const CLIENT_TYPES = ['WEB', 'IOS', 'ANDROID', 'OTHER'] as const;

export type SessionClientTypeName = (typeof CLIENT_TYPES)[number];
