"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toProfileResponse = exports.toUserResponse = void 0;
const toUserResponse = (user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarURL: user.avatar_url,
    createdAt: user.created_at,
    userId: user.username,
});
exports.toUserResponse = toUserResponse;
const toProfileResponse = (user) => ({
    id: user.id,
    userId: user.username,
    email: user.email,
    name: user.name,
    avatarURL: user.avatar_url,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
});
exports.toProfileResponse = toProfileResponse;
