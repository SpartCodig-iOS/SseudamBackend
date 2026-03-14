import { UserRecord } from '../types/user.types';

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export function fromSupabaseUser(supabaseUser: SupabaseUser): UserRecord {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
    avatar_url: supabaseUser.user_metadata?.avatar_url || null,
    username: supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || supabaseUser.id,
    password_hash: '',
    role: 'user',
    created_at: supabaseUser.created_at ? new Date(supabaseUser.created_at) : new Date(),
    updated_at: supabaseUser.updated_at ? new Date(supabaseUser.updated_at) : new Date(),
  };
}

export function toApiResponse<T>(data: T, message?: string) {
  return {
    success: true,
    data,
    message: message || 'Success',
    timestamp: new Date().toISOString(),
  };
}

export function toErrorResponse(error: string, details?: any) {
  return {
    success: false,
    error,
    details,
    timestamp: new Date().toISOString(),
  };
}

export function toUserResponse(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatar_url,
    role: user.role,
    createdAt: user.created_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
  };
}