import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../stores/locale';
import { awardText, rewardSummary } from './reward';

/** 附件摘要里的称号（定制称号设计 四） */
const names = {
  goodsName: (id: number) => `G${id}`,
  foodName: (id: number) => `F${id}`,
  icon: (key: string) => (key === 'chef' ? { title: 'CHEF' } : undefined),
};
const until = '2026-10-31T15:59:00Z'; // 北京时间 10-31 23:59
const items = {
  icons: [
    { key: 'chef', title: '金牌大厨' },
    { key: 'c7', title: '🍜面霸', days: 7 },
    { key: 'c8', title: '一天', days: 1 },
    { key: 'c9', title: '到月底', until },
  ],
};
const expired = { icons: [{ key: 'c9', title: '过期了', until, expired: true as const }] };

describe('附件摘要里的称号', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('简中：配置称号用目录里的名字，定制的用快照；三种有效期；已过期', () => {
    expect(rewardSummary(items, names)).toBe(
      '称号「CHEF」、称号「🍜面霸」 (领取后 7 天)、称号「一天」 (领取后 1 天)、称号「到月底」 (到 10/31 23:59)',
    );
    expect(rewardSummary(expired, names)).toBe('称号「过期了」已过期');
  });

  it('英语', async () => {
    await useLocaleStore().set('en');
    expect(rewardSummary(items, names)).toBe(
      'Title "CHEF", Title "🍜面霸" (7 days after claiming), Title "一天" (1 day after claiming), Title "到月底" (until 10/31, 23:59)',
    );
    expect(rewardSummary(expired, names)).toBe('Title "过期了" has expired');
  });

  it('西语、法语：写出称号名，不夹中文界面字', async () => {
    for (const l of ['es', 'fr'] as const) {
      await useLocaleStore().set(l);
      const s = rewardSummary(items, names);
      expect(s).toContain('CHEF');
      expect(s).toContain('7');
      expect(s.replace(/🍜面霸|一天|到月底|过期了/g, '')).not.toMatch(/[一-鿿]/);
      expect(rewardSummary(expired, names)).toContain('过期了');
    }
  });
});

describe('任务、活跃奖励的文字 awardText（backlog B6：活跃按钮写出这一档送什么）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('银币、经验、钻石、声望、道具、食材依次写出；没有的不写', () => {
    expect(
      awardText(
        { coin: 1200, exp: 5000, diamond: 2, renown: 3, goods: [{ id: 7, num: 2 }], foods: [{ id: 9, num: 1 }] },
        names,
      ),
    ).toBe('银币 1,200、经验 5,000、钻石 2、声望 3、G7×2、F9×1');
    expect(awardText({ diamond: 5 }, names)).toBe('钻石 5');
  });
});
