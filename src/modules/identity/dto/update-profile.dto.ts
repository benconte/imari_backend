import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  dateOfBirth: z.string().datetime({ offset: true }).optional(),
  profilePhotoUrl: z.string().url().optional(),
  preferredCurrency: z.enum(['RWF', 'USD', 'EUR', 'KES', 'UGX', 'TZS']).optional(),
  preferredLanguage: z.string().min(2).max(5).optional(),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
