export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  avatar_url: string | null;
  username: string;
  role: UserRole;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UserResponseDto {
  id: string;
  email: string;
  name: string | null;
  avatarURL: string | null;
  role: UserRole;
  createdAt: string | null;
  userId: string;
}

export interface UserProfileDto {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  avatarURL: string | null;
  role: UserRole;
  createdAt: string | null;
  updatedAt: string | null;
}

export const USER_ROLE_VALUES = ['user', 'member', 'owner', 'admin', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLE_VALUES)[number];
