import { z } from 'zod';

export const RegisterDeviceSchema = z.object({
  deviceId: z.string().uuid('deviceId must be a UUID'),
  deviceName: z.string().min(1).max(100),
  deviceType: z.enum(['IOS', 'ANDROID', 'WEB']),
  platform: z.string().max(50).optional(),
  osVersion: z.string().max(30).optional(),
  appVersion: z.string().max(20).optional(),
  fingerprint: z.string().max(255).optional(),
  pushToken: z.string().max(512).optional(),
});

export type RegisterDeviceDto = z.infer<typeof RegisterDeviceSchema>;
