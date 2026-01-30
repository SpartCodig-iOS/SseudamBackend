"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferOwnershipSchema = exports.updateMemberSchema = exports.travelInviteCodeSchema = exports.createTravelSchema = void 0;
const zod_1 = require("zod");
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = zod_1.z
    .string()
    .regex(isoDatePattern, '날짜는 YYYY-MM-DD 형식이어야 합니다.');
const exchangeRateSchema = zod_1.z.preprocess((value) => {
    if (typeof value === 'string') {
        return Number(value);
    }
    return value;
}, zod_1.z.number().positive('baseExchangeRate 는 0보다 커야 합니다.')
    .describe('기준 통화 1,000단위 대비 상대 통화 금액 (예: 1000 KRW → 105.6 JPY)'));
exports.createTravelSchema = zod_1.z
    .object({
    title: zod_1.z.string().min(1).max(120),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    countryCode: zod_1.z.string().length(2, 'countryCode 는 2자리 ISO 코드여야 합니다.'),
    countryNameKr: zod_1.z.string().min(1).max(50).optional(),
    baseCurrency: zod_1.z.string().length(3, 'baseCurrency 는 3자리 통화 코드여야 합니다.'),
    baseExchangeRate: exchangeRateSchema,
    countryCurrencies: zod_1.z.array(zod_1.z.string().length(3, 'countryCurrencies 항목은 3자리 ISO 코드여야 합니다.')).nonempty('countryCurrencies 는 적어도 하나 이상의 통화를 포함해야 합니다.'),
    budget: zod_1.z.number().int().positive('예산은 양수여야 합니다.').optional(),
    budgetCurrency: zod_1.z.string().length(3, 'budgetCurrency 는 3자리 ISO 통화 코드여야 합니다.').optional(),
})
    .refine((data) => data.startDate <= data.endDate, {
    message: 'endDate 는 startDate 이후여야 합니다.',
    path: ['endDate'],
})
    .refine((data) => {
    // 예산과 예산통화는 함께 있거나 함께 없어야 함
    const hasBudget = data.budget !== undefined;
    const hasBudgetCurrency = data.budgetCurrency !== undefined;
    return hasBudget === hasBudgetCurrency;
}, {
    message: '예산과 예산 통화는 함께 설정하거나 함께 생략해야 합니다.',
    path: ['budget'],
})
    .transform((data) => ({
    title: data.title.trim(),
    startDate: data.startDate,
    endDate: data.endDate,
    countryCode: data.countryCode.toUpperCase(),
    countryNameKr: data.countryNameKr?.trim(),
    baseCurrency: data.baseCurrency.toUpperCase(),
    baseExchangeRate: data.baseExchangeRate,
    countryCurrencies: Array.from(new Set(data.countryCurrencies.map(code => code.toUpperCase()))),
    budget: data.budget,
    budgetCurrency: data.budgetCurrency?.toUpperCase(),
}));
exports.travelInviteCodeSchema = zod_1.z.object({
    inviteCode: zod_1.z.string().min(6).max(64),
});
exports.updateMemberSchema = zod_1.z.object({
    role: zod_1.z.enum(['editor', 'viewer', 'member']),
});
exports.transferOwnershipSchema = zod_1.z.object({
    newOwnerId: zod_1.z.string().uuid(),
});
