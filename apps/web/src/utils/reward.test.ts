import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocaleStore } from '../stores/locale';
import { awardText, rewardChips, rewardSummary } from './reward';

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
        {
          coin: 1200,
          exp: 5000,
          diamond: 2,
          renown: 3,
          goods: [{ id: 7, num: 2 }],
          foods: [{ id: 9, num: 1 }],
        },
        names,
      ),
    ).toBe('银币 1,200、经验 5,000、钻石 2、声望 3、G7×2、F9×1');
    expect(awardText({ diamond: 5 }, names)).toBe('钻石 5');
  });
});

describe('邮件附件拆成小胶囊 rewardChips（界面改版 P10：邮箱）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const chipNames = {
    ...names,
    goodsArt: () => 'goods-card' as const,
    foodArt: () => 'food-misc' as const,
  };

  it('每样一枚：图 + 名字×数量；顺序和文字同附件摘要', () => {
    const i = {
      coin: 1000,
      diamond: 2,
      exp: 30,
      goods: [{ id: 5, num: 3 }],
      foods: [{ id: 8, num: 1 }],
      hats: [{ tier: 'jade' as const, name: '大橘' }],
    };
    expect(rewardChips(i, chipNames)).toEqual([
      { art: 'res-coin-silver', text: '银币 1,000' },
      { art: 'res-diamond', text: '钻石 2' },
      { art: 'res-exp', text: '经验 30' },
      { art: 'goods-card', text: 'G5×3' },
      { art: 'food-misc', text: 'F8×1' },
      { art: 'slot-hat', text: '玉•大橘之帽' },
    ]);
    expect(
      rewardChips(i, chipNames)
        .map((c) => c.text)
        .join('、'),
    ).toBe(rewardSummary(i, names));
  });

  it('称号没有图；配置称号用目录里的名字，已过期写明', () => {
    expect(rewardChips({ icons: [{ key: 'chef', title: '金牌大厨' }] }, chipNames)).toEqual([
      { art: null, text: '称号「CHEF」' },
    ]);
    expect(rewardChips(expired, chipNames)).toEqual([{ art: null, text: '称号「过期了」已过期' }]);
  });

  it('限时称号写明有效期，和附件摘要一样（定制称号设计 四）', () => {
    expect(rewardChips(items, chipNames).map((c) => c.text)).toEqual(rewardSummary(items, names).split('、'));
    expect(rewardChips(items, chipNames)[1]).toEqual({ art: null, text: '称号「🍜面霸」 (领取后 7 天)' });
  });

  it('什么都没有时为空', () => {
    expect(rewardChips({}, chipNames)).toEqual([]);
  });
});
