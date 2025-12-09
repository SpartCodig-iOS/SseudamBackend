"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutSchema = exports.appleRevokeSchema = exports.refreshSchema = exports.oauthTokenSchema = exports.loginSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
const auth_1 = require("../types/auth");
exports.signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1).max(120).optional(),
    deviceToken: zod_1.z.string().min(10).optional(),
});
const loginTypeEnum = zod_1.z.enum(auth_1.LOGIN_TYPE_VALUES);
exports.loginSchema = zod_1.z
    .object({
    identifier: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(1).optional(),
    provider: loginTypeEnum.optional(),
    accessToken: zod_1.z.string().min(1).optional(),
    authorizationCode: zod_1.z.string().min(1).optional(),
    codeVerifier: zod_1.z.string().min(10).optional(),
    redirectUri: zod_1.z.string().min(5).optional(),
    deviceToken: zod_1.z.string().min(10).optional(),
})
    .refine((data) => {
    const hasProvider = Boolean(data.provider && data.provider !== 'email');
    const isKakao = data.provider === 'kakao';
    const hasSocialToken = Boolean(data.accessToken || data.authorizationCode);
    const hasKakaoPkce = isKakao ? Boolean(data.authorizationCode && data.codeVerifier) : true;
    const hasPasswordLogin = Boolean(data.password && (data.identifier || data.email));
    return ((hasProvider && hasSocialToken && hasKakaoPkce)) || hasPasswordLogin;
}, {
    message: 'For social login provide provider and accessToken/authorizationCode, or provide email/identifier and password',
    path: ['identifier'],
})
    .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? '').trim(),
    password: data.password,
    provider: data.provider,
    accessToken: data.accessToken?.trim(),
    authorizationCode: data.authorizationCode?.trim(),
    codeVerifier: data.codeVerifier?.trim(),
    redirectUri: data.redirectUri?.trim(),
    deviceToken: data.deviceToken?.trim(),
}));
exports.oauthTokenSchema = zod_1.z
    .object({
    accessToken: zod_1.z.string().min(10, 'accessToken is required').optional(),
    loginType: loginTypeEnum.optional(),
    appleRefreshToken: zod_1.z.string().min(10).optional(),
    googleRefreshToken: zod_1.z.string().min(10).optional(),
    authorizationCode: zod_1.z.string().min(10).optional(),
    codeVerifier: zod_1.z.string().min(10).optional(),
    redirectUri: zod_1.z.string().min(5).optional(),
    deviceToken: zod_1.z.string().min(10).optional(),
})
    .refine((data) => {
    const loginType = data.loginType ?? 'email';
    const hasAccessToken = Boolean(data.accessToken);
    const isKakaoWithPkce = loginType === 'kakao' && Boolean(data.authorizationCode && data.codeVerifier);
    if (loginType === 'kakao') {
        return isKakaoWithPkce;
    }
    return hasAccessToken;
}, {
    message: 'Kakao는 authorizationCode+codeVerifier가 필요하고, 기타 프로바이더는 accessToken이 필요합니다.',
    path: ['authorizationCode'],
})
    .transform((data) => {
    const loginType = (data.loginType ??
        (data.appleRefreshToken
            ? 'apple'
            : data.googleRefreshToken
                ? 'google'
                : 'email'));
    return {
        accessToken: data.accessToken?.trim() ?? '',
        loginType,
        appleRefreshToken: data.appleRefreshToken?.trim(),
        googleRefreshToken: data.googleRefreshToken?.trim(),
        authorizationCode: data.authorizationCode?.trim(),
        codeVerifier: data.codeVerifier?.trim(),
        redirectUri: data.redirectUri?.trim(),
        deviceToken: data.deviceToken?.trim(),
    };
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
exports.appleRevokeSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10).optional(),
});
exports.logoutSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(10, 'sessionId is required'),
});
