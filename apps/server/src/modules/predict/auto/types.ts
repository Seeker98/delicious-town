import type { ShardSettings } from '@dt/config';
import type { Rng } from '@dt/shared';
import type { GameDeps } from '../../../core/deps';

export interface AutoCtx {
  d: GameDeps;
  shardId: number;
  settings: ShardSettings;
  now: Date;
  /** 出题当天（游戏日） */
  day: string;
  rng: Rng;
}

export interface AutoDraft {
  title: string;
  description: string;
  p0: number;
  closeAt: Date;
  resolveAt: Date;
  /** 判定用的参数，也是前端按语言渲染题目和说明的参数（问题记录 272） */
  params: Record<string, unknown>;
}

export interface AutoKind {
  kind: 'krab' | 'hiphop' | 'market' | 'weather' | 'stats';
  create(c: AutoCtx): Promise<AutoDraft | null>;
  /** 判出来返回结果和判定依据（中文原文 + 给前端按语言渲染的参数，问题记录 272）；数据还没生成返回 null */
  resolve(
    c: { d: GameDeps; shardId: number; settings: ShardSettings },
    params: Record<string, unknown>,
  ): Promise<{ outcome: boolean; note: string; noteParams: Record<string, unknown> } | null>;
}
