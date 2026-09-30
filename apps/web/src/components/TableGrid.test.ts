import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TableGrid from './TableGrid.vue';

describe('TableGrid', () => {
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
});
