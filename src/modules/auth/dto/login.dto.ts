import { z } from 'zod';

export const DeviceSchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    deviceName: z.string().max(100).optional(),
    deviceType: z.enum(['IOS', 'ANDROID', 'WEB']).optional(),
    platform: z.string().max(50).optional(),
    osVersion: z.string().max(30).optional(),
    appVersion: z.string().max(20).optional(),
    fingerprint: z.string().max(255).optional(),
    pushToken: z.string().max(255).optional(),
  })
  .optional();

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).optional(),
  device: DeviceSchema,
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type DeviceDto = z.infer<typeof DeviceSchema>;
