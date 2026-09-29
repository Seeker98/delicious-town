import { z } from 'zod';
import type { AccountRole } from './auth';
import { pageQuery, type RestaurantDto } from './restaurant';

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
export const playerSearchQuery = z.object({ q: z.string().trim().min(1).max(64) });

export interface PlayerRestaurantBriefDto {
  id: number;
  shardId: number;
  shardName: string;
  name: string;
  level: number;
  star: number;
  state: number;
}

export interface PlayerBriefDto {
  accountId: number;
  username: string;
  email: string;
  role: AccountRole;
  banned: boolean;
  restaurants: PlayerRestaurantBriefDto[];
}

export interface PlayerDetailDto extends PlayerBriefDto {
  emailVerified: boolean;
  bannedAt: string | null;
  banReason: string | null;
  createdAt: string;
}

export interface AdminRestaurantDto {
  overview: RestaurantDto;
  store: Array<{ goodsId: number; num: number; expiresAt: string | null }>;
  cupboard: Array<{ foodsId: number; num: number; fridgeNum: number; locked: boolean }>;
}

export const adminLedgerQuery = pageQuery.extend({
  kind: z.string().max(20).optional(),
  source: z.string().max(64).optional(),
});

export interface AdminLedgerRowDto {
  kind: string;
  itemId: number | null;
  delta: number;
  source: string;
  at: string;
}

export interface AdminLedgerPageDto {
  items: AdminLedgerRowDto[];
  nextBefore: string | null;
}

export const reasonBody = z.object({ reason: z.string().trim().min(1).max(200) });
export const adminRenameBody = z.object({
  name: z.string().max(32),
  reason: z.string().trim().min(1).max(200),
});
export const roleBody = z.object({ role: z.enum(['player', 'mod', 'admin']) });
