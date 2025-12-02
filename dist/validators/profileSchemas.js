"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = void 0;
const zod_1 = require("zod");
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z
        .preprocess((val) => (val === undefined || val === null || val === '' ? undefined : val), zod_1.z.string().min(1).max(120).optional()),
    avatarURL: zod_1.z
        .preprocess((val) => (val === undefined || val === null || val === '' ? undefined : val), zod_1.z.string().url().optional()),
});
