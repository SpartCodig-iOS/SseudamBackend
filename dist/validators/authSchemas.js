"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshSchema = exports.loginSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
exports.signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1).max(120).optional(),
});
exports.loginSchema = zod_1.z
    .object({
    identifier: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().min(1).optional(),
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
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(10),
});
