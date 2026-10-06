import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import { activeMessages } from '../i18n';
import { useLocaleStore } from '../stores/locale';
import { effectChips } from './effects';

describe('effectChips（问题记录：生效的加成展示凌乱）', () => {
  afterEach(async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('zh-CN');
  });

  it('每项一个标签；挑剔率、耗油是越低越好', () => {
    expect(effectChips({ atRate: 0.35, spRate: 0.1, oilRate: -0.1, luckValue: 36 })).toEqual([
      { text: '上座率+35%', good: true },
      { text: '挑剔率+10%', good: false },
      { text: '耗油-10%', good: true },
      { text: '幸运+36', good: true },
    ]);
  });

  it('法文：百分数用小数逗号，百分号前有不换行空格（视觉第三轮）', async () => {
    setActivePinia(createPinia());
    await useLocaleStore().set('fr');
    expect(effectChips({ coinRate: 0.125 })[0]!.text).toMatch(/\+12,5[\u00a0\u202f]%/);
    // 强化成功率后的拆分：模板里会吃掉前面的空格，文案自己带
    expect(activeMessages().equip.detail.rateParts('1', '2', '3', '4')).toMatch(/^ \(/);
  });
});
