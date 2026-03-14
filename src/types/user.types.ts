export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
  SUPER_ADMIN = 'super_admin',
}

export interface UserProfile {
  id: number;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
  roles: UserRole[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password?: string;
  nickname?: string;
  profileImageUrl?: string;
}

export interface UpdateUserRequest {
  nickname?: string;
  profileImageUrl?: string;
}

export interface UserWithRoles {
  id: number;
  email: string;
  nickname?: string;
  roles: UserRole[];
}

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  username: string;
  password_hash: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}