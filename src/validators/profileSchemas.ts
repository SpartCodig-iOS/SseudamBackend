import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z
    .preprocess((val) => (val === undefined || val === null || val === '' ? undefined : val), z.string().min(1).max(120))
    .optional(),
  avatarURL: z
    .preprocess((val) => (val === undefined || val === null || val === '' ? undefined : val), z.string().url())
    .optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
