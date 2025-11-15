import { User } from '@supabase/supabase-js';
import { UserRecord, UserResponseDto, UserProfileDto } from '../types/user';

const formatDate = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const toUserResponse = (user: UserRecord): UserResponseDto => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatarURL: user.avatar_url,
  createdAt: formatDate(user.created_at),
  userId: user.username,
});

export const toProfileResponse = (user: UserRecord): UserProfileDto => ({
  id: user.id,
  userId: user.username,
  email: user.email,
  name: user.name,
  avatarURL: user.avatar_url,
  createdAt: formatDate(user.created_at),
  updatedAt: formatDate(user.updated_at),
});

interface SupabaseNameOptions {
  preferDisplayName?: boolean;
}

const resolveUserName = (user: User, options?: SupabaseNameOptions): string | null => {
  const metadata = user.user_metadata ?? {};
  const displayName =
    (metadata.display_name as string | undefined) ??
    (metadata.full_name as string | undefined) ??
    null;
  const regularName =
    (metadata.name as string | undefined) ??
    (metadata.full_name as string | undefined) ??
    null;

  if (options?.preferDisplayName) {
    return displayName ?? regularName;
  }
  return regularName ?? displayName;
};

export const fromSupabaseUser = (supabaseUser: User, options?: SupabaseNameOptions): UserRecord => ({
  id: supabaseUser.id,
  email: supabaseUser.email ?? '',
  name: resolveUserName(supabaseUser, options),
  avatar_url: (supabaseUser.user_metadata?.avatar_url as string | null) ?? null,
  username: supabaseUser.email?.split('@')[0] || supabaseUser.id,
  password_hash: '',
  created_at: supabaseUser.created_at ? new Date(supabaseUser.created_at) : null,
  updated_at: supabaseUser.updated_at ? new Date(supabaseUser.updated_at) : null,
});
