"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutSchema = exports.appleRevokeSchema = exports.refreshSchema = exports.oauthTokenSchema = exports.loginSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
const auth_1 = require("../types/auth");
exports.signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1).max(120).optional(),
});
const loginTypeEnum = zod_1.z.enum(auth_1.LOGIN_TYPE_VALUES);
exports.loginSchema = zod_1.z
    .object({
    identifier: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(1),
})
    .refine((data) => Boolean(data.identifier ?? data.email), {
    message: 'Either identifier or email is required',
    path: ['identifier'],
})
    .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? '').trim(),
    password: data.password,
}));
exports.oauthTokenSchema = zod_1.z
    .object({
    accessToken: zod_1.z.string().min(10, 'accessToken is required'),
    loginType: loginTypeEnum.optional(),
    appleRefreshToken: zod_1.z.string().min(10).optional(),
    googleRefreshToken: zod_1.z.string().min(10).optional(),
    authorizationCode: zod_1.z.string().min(10).optional(),
    codeVerifier: zod_1.z.string().min(10).optional(),
    redirectUri: zod_1.z.string().min(5).optional(),
})
    .transform((data) => ({
    accessToken: data.accessToken.trim(),
    loginType: (data.loginType ??
        (data.authorizationCode
            ? 'apple'
            : data.appleRefreshToken
                ? 'apple'
                : data.googleRefreshToken
                    ? 'google'
                    : 'email')),
    appleRefreshToken: data.appleRefreshToken?.trim(),
    googleRefreshToken: data.googleRefreshToken?.trim(),
    authorizationCode: data.authorizationCode?.trim(),
    codeVerifier: data.codeVerifier?.trim(),
    redirectUri: data.redirectUri?.trim(),
}));
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.appleRevokeSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10).optional(),
});
exports.logoutSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(10, 'sessionId is required'),
});
