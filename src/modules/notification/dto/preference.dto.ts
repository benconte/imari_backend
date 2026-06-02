import { z } from 'zod';
import { NotificationChannel, NotificationType } from '@prisma/client';

export const UpdatePreferenceSchema = z.object({
  channels: z
    .array(z.nativeEnum(NotificationChannel))
    .min(1, 'At least one channel must be selected')
    .optional(),
  mutedTypes: z.array(z.nativeEnum(NotificationType)).optional(),
  quietFrom: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'quietFrom must be in HH:MM format')
    .nullable()
    .optional(),
  quietTo: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'quietTo must be in HH:MM format')
    .nullable()
    .optional(),
  timezone: z.string().min(1).max(64).optional(),
  emailDigest: z.boolean().optional(),
});

export type UpdatePreferenceDto = z.infer<typeof UpdatePreferenceSchema>;
