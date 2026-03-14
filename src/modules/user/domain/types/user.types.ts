export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  SUPER_ADMIN = 'super_admin',
}

export interface UserRecord {
  id: string;
  memberId?: string;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
  role: UserRole | string;
  isActive?: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  password_hash?: string;
  name?: string;
  avatar_url?: string;
  username?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserResponseDto {
  id: string;
  memberId: string;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfileDto {
  nickname?: string;
  profileImageUrl?: string;
}

export interface CreateUserDto {
  memberId: string;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
  role?: UserRole;
}

export interface UpdateUserDto {
  nickname?: string;
  profileImageUrl?: string;
  isActive?: boolean;
}