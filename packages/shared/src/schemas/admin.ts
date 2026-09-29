import { z } from 'zod';

export type AdminRole = 'mod' | 'admin';

export interface AdminMeDto {
  accountId: number;
  username: string;
  role: AdminRole;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export interface AdminShardDto {
  id: number;
  name: string;
  status: string;
  restaurants: number;
}

export interface ShardSettingsDto {
  version: number;
  defaults: Record<string, unknown>;
  override: Record<string, unknown>;
  effective: Record<string, unknown>;
  features: Array<{ name: string; enabled: boolean }>;
}

const note = z.string().trim().min(1).max(200);
export const saveOverrideBody = z.object({
  override: z.record(z.string(), z.unknown()),
  note,
  version: z.number().int().min(0),
});
export const rollbackBody = z.object({ version: z.number().int().min(1), note });

export interface ShardHistoryDto {
  version: number;
  override: Record<string, unknown>;
  actor: string | null;
  note: string;
  changed: string[];
  at: string;
}
