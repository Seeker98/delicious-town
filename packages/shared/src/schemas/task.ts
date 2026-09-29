import { z } from 'zod';
import type { AwardDto } from './growth';

export const claimTaskBody = z.object({ taskId: z.number().int().positive() });
export const claimActivationBody = z.object({ points: z.number().int().positive() });

export interface TaskDto {
  id: number;
  main: boolean;
  step: number;
  name: string;
  href: string;
  kind: 'counter' | 'state';
  key: string;
  target: number;
  progress: number;
  done: boolean;
  award: AwardDto;
}

export interface TasksDto {
  /** 实际所在的主线步骤（跳过了未开放的功能） */
  mainStep: number;
  main: TaskDto | null;
  side: TaskDto[];
}

export interface ActivationDto {
  total: number;
  signedIn: boolean;
  items: Array<{ id: number; name: string; points: number; limit: number; count: number; needStar: number }>;
  rewards: Array<{ points: number; award: AwardDto; claimed: boolean; multiplier: number }>;
}
