import { z } from 'zod';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const createExpenseSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.').max(50, '제목은 50자 이하여야 합니다.'),
  note: z.string().max(500).optional(),
  amount: z.number().positive('금액은 0보다 큰 값이어야 합니다.'),
  currency: z.string().length(3, 'currency 는 3자리 통화 코드여야 합니다.').transform((val) => val.toUpperCase()),
  expenseDate: z
    .string()
    .regex(isoDatePattern, 'expenseDate 는 YYYY-MM-DD 형식이어야 합니다.')
    .refine((date) => {
      const expenseDate = new Date(date);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // 오늘 끝까지 허용
      return expenseDate <= today;
    }, '지출 날짜는 미래 날짜일 수 없습니다.'),
  category: z.string().min(1).max(50).optional(),
  payerId: z.string().uuid().optional(),
  participantIds: z.array(z.string().uuid()).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
