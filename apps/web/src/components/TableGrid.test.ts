import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('楼层按钮是一排能换行的独立按钮（问题记录 314：楼层多时按钮组超出手机屏幕）', () => {
    const tables = Array.from({ length: 8 }, (_, i) => ({ no: i * 16 + 1, floor: i + 1, customer: 0 }));
    const w = mount(TableGrid, { props: { tables } });
    const box = w.get('[data-testid="floor-tabs"]');
    expect(box.classes()).toContain('flex-wrap');
    expect(w.find('.btn-group').exists()).toBe(false);
    expect(box.findAll('button')).toHaveLength(8);
  });
});

describe('有蟑螂的楼层标出来（问题记录 561）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('楼层按钮上有虫子图标和只数；没有蟑螂的楼层没有', () => {
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
    expect(r.find('i.bi-bug').exists()).toBe(true);
    expect(r.text()).toContain('2');
  });
});
