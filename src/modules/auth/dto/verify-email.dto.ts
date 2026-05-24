import { z } from 'zod';

export const VerifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
