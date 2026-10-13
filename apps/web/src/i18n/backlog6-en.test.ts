import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { activeMessages } from '.';
import { useLocaleStore } from '../stores/locale';

describe('backlog 多语言：英、法、西文案修正', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('痞老板说明写明"偶尔"才自己坐下吃饭', async () => {
    const want = { en: 'Now and then', fr: 'De temps en temps', es: 'De vez en cuando' } as const;
    for (const [l, phrase] of Object.entries(want)) {
      await useLocaleStore().set(l as keyof typeof want);
      expect(activeMessages().home.plankton.body2, l).toContain(phrase);
    }
    // 连续加载三个语言包，全量并行跑时可能超过默认的 15 秒（backlog 测试不稳定）
  }, 60_000);
});
