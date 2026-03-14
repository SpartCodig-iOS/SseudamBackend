import { z } from 'zod';

export const updateProfileSchema = z.object({
  nickname: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  bio: z.string().optional(),
  location: z.string().optional(),
  website: z.string().url().optional(),
  avatarURL: z.string().url().optional(),
  profileImageUrl: z.string().url().optional(),
  displayName: z.string().min(1).optional(),
}).strict().transform((input) => ({
  ...input,
  avatarURL: input.avatarURL ?? input.profileImageUrl,
}));

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
