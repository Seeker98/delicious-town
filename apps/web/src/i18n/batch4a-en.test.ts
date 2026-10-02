import { mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DuelResultDto } from '@dt/shared';
import { awardText, handName } from '../components/bar/award';
import DuelResult from '../components/tower/DuelResult.vue';
import { useLocaleStore } from '../stores/locale';
import { wenjieLines } from '../utils/wenjie';

const names = { goodsName: (id: number) => `G${id}`, foodName: (id: number) => `F${id}` };
const side = (name: string, power: number) => ({ name, power, scores: [5, 4, 3, 2, 1], sum: 15 });

describe('第 4a 批酒吧、厨塔按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：出拳、奖励、雯姐、切磋结果', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    // 加载语言包期间别的计时器可能把活动 Pinia 换成旧的（见 LangSelect.test），挂载前换回来
    setActivePinia(pinia);
    expect([0, 1, 2].map(handName)).toEqual(['Rock', 'Scissors', 'Paper']);
    expect(awardText({ kind: 'coin', id: null, num: 1400, lucky: true }, names)).toBe('1,400 coins (lucky)');
    expect(wenjieLines(null).some((l) => /[一-鿿]/.test(l.text))).toBe(false);
    const result = {
      test: false,
      win: true,
      renown: 5,
      rank: 3,
      me: side('Me', 100),
      them: side('Bob', 90),
      awards: [],
    } as unknown as DuelResultDto;
    const w = mount(DuelResult, { props: { result } });
    expect(w.find('[data-testid="duel-headline"]').text()).toBe("You won, Renown +5, you're now #3");
    expect(w.text()).toContain('Me (Chef power 100)');
    expect(w.text()).not.toMatch(/[一-鿿]/);
  });
});
