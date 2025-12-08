import { z } from 'zod';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDateSchema = z
  .string()
  .regex(isoDatePattern, '날짜는 YYYY-MM-DD 형식이어야 합니다.');

const exchangeRateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    return Number(value);
  }
  return value;
}, z.number().positive('baseExchangeRate 는 0보다 커야 합니다.')
    .describe('기준 통화 1,000단위 대비 상대 통화 금액 (예: 1000 KRW → 105.6 JPY)'));

export const createTravelSchema = z
  .object({
    title: z.string().min(1).max(120),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    countryCode: z.string().length(2, 'countryCode 는 2자리 ISO 코드여야 합니다.'),
    countryNameKr: z.string().min(1).max(50).optional(),
    baseCurrency: z.string().length(3, 'baseCurrency 는 3자리 통화 코드여야 합니다.'),
    baseExchangeRate: exchangeRateSchema,
    countryCurrencies: z.array(z.string().length(3, 'countryCurrencies 항목은 3자리 ISO 코드여야 합니다.')).nonempty('countryCurrencies 는 적어도 하나 이상의 통화를 포함해야 합니다.'),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'endDate 는 startDate 이후여야 합니다.',
    path: ['endDate'],
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
  }));

export type CreateTravelInput = z.infer<typeof createTravelSchema>;

export const travelInviteCodeSchema = z.object({
  inviteCode: z.string().min(6).max(64),
});

export type TravelInviteJoinInput = z.infer<typeof travelInviteCodeSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(['editor', 'viewer', 'member']),
});

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});

export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
