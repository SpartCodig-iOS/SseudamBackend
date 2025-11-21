"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromSupabaseUser = exports.toProfileResponse = exports.toUserResponse = void 0;
const formatDate = (value) => {
    if (!value)
        return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const toUserResponse = (user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarURL: user.avatar_url,
    role: user.role,
    createdAt: formatDate(user.created_at),
    userId: user.username,
});
exports.toUserResponse = toUserResponse;
const toProfileResponse = (user) => ({
    id: user.id,
    userId: user.username,
    email: user.email,
    name: user.name,
    avatarURL: user.avatar_url,
    role: user.role,
    createdAt: formatDate(user.created_at),
    updatedAt: formatDate(user.updated_at),
});
exports.toProfileResponse = toProfileResponse;
const resolveUserName = (user, options) => {
    const metadata = user.user_metadata ?? {};
    const displayName = metadata.display_name ??
        metadata.full_name ??
        null;
    const regularName = metadata.name ??
        metadata.full_name ??
        null;
    if (options?.preferDisplayName) {
        return displayName ?? regularName;
    }
    return regularName ?? displayName;
};
const fromSupabaseUser = (supabaseUser, options) => ({
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: resolveUserName(supabaseUser, options),
    avatar_url: supabaseUser.user_metadata?.avatar_url ?? null,
    username: supabaseUser.email?.split('@')[0] || supabaseUser.id,
    password_hash: '',
    role: 'user',
    created_at: supabaseUser.created_at ? new Date(supabaseUser.created_at) : null,
    updated_at: supabaseUser.updated_at ? new Date(supabaseUser.updated_at) : null,
});
exports.fromSupabaseUser = fromSupabaseUser;
