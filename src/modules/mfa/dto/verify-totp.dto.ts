import { z } from 'zod';

export const DisableMfaSchema = z.object({
  code: z.string().min(6).max(10),
});

export type DisableMfaDto = z.infer<typeof DisableMfaSchema>;
