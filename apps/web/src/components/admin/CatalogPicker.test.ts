import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../../stores/catalog';
import CatalogPicker from './CatalogPicker.vue';

const goods = (id: number, name: string, type: number) =>
  ({ id, name, type, deviceType: null, level: 1, desc: '', coin: 0, diamond: 0, stackable: true }) as never;

describe('CatalogPicker（问题记录 270：后台选道具不用手填 id）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const c = useCatalogStore();
    c.goodsMap = new Map([
      [85, goods(85, '体力卡', 0)],
      [315, goods(315, '喇叭', 1)],
      [91101, goods(91101, '南瓜大厨手办', 10)],
      [91102, goods(91102, '糖炒栗子师傅手办', 10)],
    ]);
    c.foodsMap = new Map([[7, { id: 7, name: '雪蛤', level: 3, odds: 1, coin: 0, type: null }]]);
  });

  const picker = (kind: 'goods' | 'foods' = 'goods', modelValue: number | '' = '') =>
    mount(CatalogPicker, { props: { kind, modelValue, testid: 'p' } });

  it('按名字搜：列出名字、类型和 id；点一项就选中，框里显示名字', async () => {
    const w = picker();
    await w.get('[data-testid="p"]').setValue('手办');
    const opts = w.findAll('[data-testid^="p-opt-"]');
    expect(opts.map((o) => o.text())).toEqual([
      '南瓜大厨手办 · 纪念品 · #91101',
      '糖炒栗子师傅手办 · 纪念品 · #91102',
    ]);
    await opts[1]!.trigger('mousedown');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([91102]);
    expect((w.get('[data-testid="p"]').element as HTMLInputElement).value).toBe('糖炒栗子师傅手办');
    expect(w.find('[data-testid^="p-opt-"]').exists()).toBe(false);
  });

  it('按名字搜不区分大小写（问题记录 316）', async () => {
    useCatalogStore().goodsMap.set(500, goods(500, 'XO酱礼盒', 0));
    const w = picker();
    await w.get('[data-testid="p"]').setValue('xo');
    expect(w.findAll('[data-testid^="p-opt-"]').map((o) => o.text())).toEqual(['XO酱礼盒 · 消耗品 · #500']);
  });

  it('键盘：↓ 移到下一项，回车选中', async () => {
    const w = picker();
    const input = w.get('[data-testid="p"]');
    await input.setValue('手办');
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([91102]);
  });

  it('直接填数字 id 照样生效；按 id 开头也能搜到', async () => {
    const w = picker();
    await w.get('[data-testid="p"]').setValue('315');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([315]);
    expect(w.findAll('[data-testid^="p-opt-"]').map((o) => o.text())).toEqual(['喇叭 · 道具 · #315']);
  });

  it('已有的 id 显示成名字；清空就清掉选择', async () => {
    const w = picker('goods', 85);
    const input = w.get('[data-testid="p"]');
    expect((input.element as HTMLInputElement).value).toBe('体力卡');
    await input.setValue('');
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['']);
  });

  it('食材：显示等级', async () => {
    const w = picker('foods');
    await w.get('[data-testid="p"]').setValue('雪');
    expect(w.get('[data-testid="p-opt-7"]').text()).toBe('雪蛤 · 3 级 · #7');
  });

  it('最多列 20 条', async () => {
    const c = useCatalogStore();
    c.goodsMap = new Map(Array.from({ length: 30 }, (_, i) => [i + 1, goods(i + 1, `卡${i + 1}`, 1)]));
    const w = picker();
    await w.get('[data-testid="p"]').setValue('卡');
    expect(w.findAll('[data-testid^="p-opt-"]')).toHaveLength(20);
  });
});
