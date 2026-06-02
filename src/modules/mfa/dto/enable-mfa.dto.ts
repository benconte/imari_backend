import { z } from 'zod';

export const ConfirmMfaSchema = z.object({
  totpCode: z
    .string()
    .min(1, 'TOTP code is required')
    .transform((val) => val.trim().replace(/\s+/g, ''))
    .refine((val) => /^\d{6}$/.test(val), 'TOTP code must be exactly 6 digits'),
});

export type ConfirmMfaDto = z.infer<typeof ConfirmMfaSchema>;
