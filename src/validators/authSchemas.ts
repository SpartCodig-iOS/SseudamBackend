import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120).optional(),
});

export const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.identifier ?? data.email), {
    message: 'Either identifier or email is required',
    path: ['identifier'],
  })
  .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? '').trim(),
    password: data.password,
  }));

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
