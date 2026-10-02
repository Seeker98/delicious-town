import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityDto } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import { actionName, activityStatus, kindLabel, timeLeft } from '../utils/activity';

describe('第 5 批活动、交易按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：剩余时间、动作名、活动类型、状态', async () => {
    await useLocaleStore().set('en');
    const now = new Date('2026-10-01T00:00:00Z');
    expect(timeLeft('2026-10-03T05:30:00Z', now)).toBe('2 d 5 h left');
    expect(timeLeft('2026-10-01T00:20:00Z', now)).toBe('20 min left');
    expect(timeLeft('2026-09-30T00:00:00Z', now)).toBe('Ended');
    expect(actionName('signin')).toBe('Check in');
    expect(kindLabel({ kind: 'pass' } as ActivityDto)).toBe('Battle pass');
    expect(activityStatus({ state: 'settling', exchangeUntil: null } as ActivityDto, now)).toBe('Settling');
  });
});
