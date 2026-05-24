import { z } from 'zod';

export const ConfirmMfaSchema = z.object({
  totpCode: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d+$/),
});

export type ConfirmMfaDto = z.infer<typeof ConfirmMfaSchema>;
