"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRoleSchema = void 0;
const zod_1 = require("zod");
const user_1 = require("../types/user");
exports.updateRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(user_1.USER_ROLE_VALUES),
    reason: zod_1.z.string().trim().max(200).optional(),
});
