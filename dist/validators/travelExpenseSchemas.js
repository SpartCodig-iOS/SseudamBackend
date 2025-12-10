"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExpenseSchema = exports.expenseCategories = void 0;
const zod_1 = require("zod");
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
exports.expenseCategories = [
    'accommodation', // 숙박
    'food_and_drink', // 식비
    'transportation', // 교통
    'activity', // 관광/활동
    'shopping', // 쇼핑/선물
    'other', // 기타 지출
];
exports.createExpenseSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, '제목은 필수입니다.').max(50, '제목은 50자 이하여야 합니다.'),
    note: zod_1.z.string().max(500).optional(),
    amount: zod_1.z.number().positive('금액은 0보다 큰 값이어야 합니다.'),
    currency: zod_1.z.string().length(3, 'currency 는 3자리 통화 코드여야 합니다.').transform((val) => val.toUpperCase()),
    expenseDate: zod_1.z
        .string()
        .regex(isoDatePattern, 'expenseDate 는 YYYY-MM-DD 형식이어야 합니다.'),
    category: zod_1.z.enum(exports.expenseCategories).optional().nullable(),
    payerId: zod_1.z.string().uuid().optional().nullable(),
    participantIds: zod_1.z.array(zod_1.z.string().uuid('잘못된 참가자 ID 형식입니다.'))
        .min(1, '참가자는 최소 1명 이상이어야 합니다.')
        .max(20, '참가자는 최대 20명까지 가능합니다.')
        .optional()
        .refine((ids) => {
        if (!ids)
            return true; // optional이므로 undefined는 허용
        // 중복 ID 검사
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
    }, '중복된 참가자 ID가 있습니다.'),
});
