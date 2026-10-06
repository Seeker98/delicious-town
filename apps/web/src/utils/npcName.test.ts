import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RestLogDto } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import { logText } from './events';
import { restName, restNotice } from './npcName';

const me = (npcRestId: number | null) => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role: 'player' as const,
  shardId: 1,
  restaurantId: 1,
  lang: null,
  npcRestId,
});

const names = {
  goodsName: (id: number) => `g${id}`,
  foodName: (id: number) => `f${id}`,
  mcName: (id: number) => `m${id}`,
};

describe('蟹老板（NPC）的店名按语言（视觉第三轮记下的）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('本区服的 NPC 店换成当前语言的名字和公告；别的店、没读到账号时原样', async () => {
    await useLocaleStore().set('en');
    expect(restName(9, '蟹老板')).toBe('蟹老板');
    useSessionStore().me = me(9);
    expect(restName(9, '蟹老板')).toBe('Mr. Krab');
    expect(restNotice(9, '欢迎光临蟹黄堡！')).toBe('Welcome to the Krusty Krab!');
    expect(restName(10, '小王的店')).toBe('小王的店');
    expect(restNotice(10, '玩家写的公告')).toBe('玩家写的公告');
    useSessionStore().me = me(null);
    expect(restName(9, '蟹老板')).toBe('蟹老板');
  });

  it('白食日志里的店名也换（日志存的是当时的中文店名）', async () => {
    await useLocaleStore().set('fr');
    useSessionStore().me = me(9);
    const log = (host: number, hostName: string): RestLogDto => ({
      type: 'dine.started',
      params: { host, hostName, table: 1 },
      at: '2026-10-06T00:00:00.000Z',
    });
    expect(logText(log(9, '蟹老板'), names)).toContain('M. Krab');
    expect(logText(log(10, '小王的店'), names)).toContain('小王的店');
  });
});
