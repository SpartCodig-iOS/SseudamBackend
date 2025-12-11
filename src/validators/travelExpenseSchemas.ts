import { z } from 'zod';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
export const expenseCategories = [
  'accommodation',   // 숙박
  'food_and_drink',  // 식비
  'transportation',  // 교통
  'activity',        // 관광/활동
  'shopping',        // 쇼핑/선물
  'other',           // 기타 지출
] as const;

export const createExpenseSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.').max(50, '제목은 50자 이하여야 합니다.'),
  note: z.string().max(500).optional(),
  amount: z.number().positive('금액은 0보다 큰 값이어야 합니다.'),
  currency: z.string().length(3, 'currency 는 3자리 통화 코드여야 합니다.').transform((val) => val.toUpperCase()),
  expenseDate: z
    .string()
    .regex(isoDatePattern, 'expenseDate 는 YYYY-MM-DD 형식이어야 합니다.'),
  category: z.enum(expenseCategories).optional().nullable(),
  payerId: z.string().uuid().optional().nullable(),
  participantIds: z
    .array(z.string().trim())
    .optional()
    .transform(ids => (ids ?? []).map(id => id.trim()).filter(Boolean))
    .transform(ids => ids.filter(id => uuidPattern.test(id)))
    .refine((ids) => {
      const uniqueIds = new Set(ids);
      return uniqueIds.size === ids.length;
    }, '중복된 참가자 ID가 있습니다.'),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
