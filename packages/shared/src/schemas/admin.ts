import { z } from 'zod';

export type AdminRole = 'mod' | 'admin';

export interface AdminMeDto {
  accountId: number;
  username: string;
  role: AdminRole;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
