import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import TableGrid from './TableGrid.vue';

describe('TableGrid', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('按楼层显示，标出蟑螂和白食者；点桌子发出 pick', async () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          { no: 1, floor: 1, customer: 3, roach: true, roachBy: null },
          { no: 2, floor: 1, customer: 9, freeloaderRestId: 5, freeloaderName: '乙', freeloaderSince: 'x' },
          { no: 17, floor: 2, customer: 0 },
        ],
      },
    });
    expect(w.find('[data-testid="table-1"]').text()).toContain('蟑螂');
    expect(w.find('[data-testid="table-2"]').text()).toContain('乙');
    expect(w.find('[data-testid="table-17"]').exists()).toBe(false);
    await w.find('[data-testid="table-1"]').trigger('click');
    expect(w.emitted('pick')![0]).toEqual([expect.objectContaining({ no: 1 })]);
  });

  it('楼层是一排能换行的筛选胶囊（问题记录 314；界面改版 P3：原来是一排按钮）', async () => {
    const tables = Array.from({ length: 8 }, (_, i) => ({ no: i * 16 + 1, floor: i + 1, customer: 0 }));
    const w = mount(TableGrid, { props: { tables } });
    const box = w.get('[data-testid="floor-tabs"]');
    expect(box.classes()).toContain('dt-pills');
    const btns = box.findAll('button');
    expect(btns).toHaveLength(8);
    expect(btns.some((b) => b.classes().includes('btn'))).toBe(false);
    expect(btns[0]!.classes()).toContain('active');
    expect(btns[0]!.attributes('aria-pressed')).toBe('true');
    await btns[2]!.trigger('click');
    expect(btns[2]!.attributes('aria-pressed')).toBe('true');
  });
});

describe('有蟑螂的楼层标出来（问题记录 561）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('楼层胶囊上有红色小标签“蟑螂 N”；没有蟑螂的楼层没有（界面改版 P7）', () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          { no: 1, floor: 1, customer: 0 },
          { no: 17, floor: 2, customer: 3, roach: true, roachBy: null },
          { no: 18, floor: 2, customer: 3, roach: true, roachBy: 5 },
          { no: 33, floor: 3, customer: -3 },
        ],
      },
    });
    expect(w.find('[data-testid="floor-roach-1"]').exists()).toBe(false);
    expect(w.find('[data-testid="floor-roach-3"]').exists()).toBe(false);
    const r = w.get('[data-testid="floor-roach-2"]');
    // 标签文字本身就是“蟑螂 2”，读屏照读（backlog 1010）
    expect(r.classes()).toContain('dt-tag-danger');
    expect(r.text()).toBe('蟑螂 2');
  });

  it('格子上面一行汇总这一层：几桌、几桌在吃、几只蟑螂、几桌白食，没有的不写（界面改版 P7）', () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          { no: 1, floor: 1, customer: 3, roach: true, roachBy: null },
          { no: 2, floor: 1, customer: 2 },
          { no: 3, floor: 1, customer: 1 },
          { no: 4, floor: 1, customer: 0 },
        ],
      },
    });
    expect(w.get('[data-testid="floor-summary"]').text()).toBe('1 楼 4 桌 · 2 桌在吃 · 1 只蟑螂');
  });
});

describe('每桌点的菜（问题记录 559）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('格子中间写点的菜或吃的特色菜，下面是顾客类型短标签；都没有时只写顾客类型（界面改版 P7）', () => {
    const catalog = useCatalogStore();
    catalog.dataMap = new Map([['cookbooks:5', { id: 5, name: '宫保鸡丁' }]]) as never;
    catalog.mcMap = new Map([[42, { id: 42, name: '佛跳墙' }]]) as never;
    const w = mount(TableGrid, {
      props: {
        tables: [
          {
            no: 1,
            floor: 1,
            customer: 2,
            last: { type: 2, coin: 1, exp: 1, oil: 1, req: 3, grade: 2, cookbookId: 5 },
          },
          { no: 2, floor: 1, customer: 1, last: { type: 1, coin: 1, exp: 1, oil: 1, mcId: 42, mcNum: 1 } },
          { no: 3, floor: 1, customer: 1, last: { type: 1, coin: 1, exp: 1, oil: 1 } },
        ],
      },
    });
    expect(w.get('[data-testid="table-dish-1"]').text()).toBe('宫保鸡丁');
    expect(w.get('[data-testid="table-dish-2"]').text()).toBe('佛跳墙');
    expect(w.find('[data-testid="table-dish-3"]').exists()).toBe(false);
    expect(w.get('[data-testid="table-1"] .dt-tag').text()).toBe('挑剔');
    expect(w.get('[data-testid="table-3"]').text()).toContain('普通顾客');
  });

  it('目录里查不到菜名时用各语言的占位名，不显示 #id（backlog 1010）', () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          {
            no: 1,
            floor: 1,
            customer: 2,
            last: { type: 2, coin: 1, exp: 1, oil: 1, req: 3, grade: 2, cookbookId: 99 },
          },
        ],
      },
    });
    expect(w.get('[data-testid="table-dish-1"]').text()).toBe('菜谱99');
  });
});

describe('同一排格子一样高（问题记录 585）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('格子撑满这一排的高度：多一行菜名、白食者名字折行、已消灭的蟑螂都不会让这一排高低不齐', () => {
    const w = mount(TableGrid, {
      props: {
        tables: [
          { no: 1, floor: 1, customer: 1 },
          {
            no: 2,
            floor: 1,
            customer: 9,
            freeloaderRestId: 5,
            freeloaderName: '一个很长的店名',
            freeloaderSince: 'x',
          },
        ],
      },
    });
    // 内容靠上排：按钮默认把内容垂直居中，撑高以后短格子的桌号会比旁边低半行（终审）
    // 界面改版 P3：撑满、靠上排写在 .dt-table-cell 的样式里
    for (const no of [1, 2])
      expect(w.get(`[data-testid="table-${no}"]`).classes()).toContain('dt-table-cell');
  });
});

describe('餐桌格子（界面改版 P3）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('每桌一个格子；有蟑螂、有白食的桌各有标记；选中的 aria-pressed', () => {
    const w = mount(TableGrid, {
      props: {
        selected: 2,
        tables: [
          { no: 1, floor: 1, customer: 3, roach: true, roachBy: null },
          { no: 2, floor: 1, customer: 9, freeloaderRestId: 5, freeloaderName: '乙', freeloaderSince: 'x' },
          { no: 3, floor: 1, customer: 1 },
        ],
      },
    });
    expect(w.get('[data-testid="table-1"]').classes()).toContain('is-roach');
    expect(w.get('[data-testid="table-2"]').classes()).toContain('is-freeloader');
    expect(w.get('[data-testid="table-2"]').attributes('aria-pressed')).toBe('true');
    expect(w.get('[data-testid="table-3"]').attributes('aria-pressed')).toBe('false');
    expect(w.find('.border-primary').exists()).toBe(false);
  });
});
