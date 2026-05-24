import { z } from 'zod';

export const UploadKycSchema = z.object({
  documentType: z.enum(['NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE']),
  documentNumber: z.string().min(1).max(50),
  documentFrontUrl: z.string().url('documentFrontUrl must be a valid URL'),
  documentBackUrl: z.string().url().optional(),
  selfieUrl: z.string().url().optional(),
});

export type UploadKycDto = z.infer<typeof UploadKycSchema>;
