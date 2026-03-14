export const USER_ROLE_VALUES = ['user', 'admin', 'moderator', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];

export enum UserRoleEnum {
  ADMIN = 'admin',
  USER = 'user',
  SUPER_ADMIN = 'super_admin',
  MODERATOR = 'moderator',
}