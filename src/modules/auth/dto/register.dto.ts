import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +250788000000)'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one digit'),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  referralCode: z.string().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
