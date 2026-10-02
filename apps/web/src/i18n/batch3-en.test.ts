import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableDto } from '@dt/shared';
import ReportButton from '../components/ReportButton.vue';
import TableGrid from '../components/TableGrid.vue';
import { useLocaleStore } from '../stores/locale';

vi.mock('../api/endpoints', () => ({ endpoints: { report: vi.fn() } }));

const table = (no: number, floor: number, customer: number, extra: Partial<TableDto> = {}) =>
  ({ no, floor, customer, ...extra }) as TableDto;

describe('第 3 批社交页面按语言（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('英语：餐桌（楼层、白食、顾客类型）、举报卡片', async () => {
    await useLocaleStore().set('en');
    const grid = mount(TableGrid, {
      props: { tables: [table(1, 1, 9, { freeloaderName: 'Bob' }), table(2, 2, 2)] },
    });
    expect(grid.text()).toContain('Floor 1');
    expect(grid.find('[data-testid="table-1"]').text()).toContain('Freeloading: Bob');
    const report = mount(ReportButton, { props: { targetType: 'post', targetId: 1 } });
    expect(report.find('[data-testid="report-open"]').text()).toBe('Report');
    await report.find('[data-testid="report-open"]').trigger('click');
    expect(report.text()).toContain('Abuse');
    expect(report.text()).toContain('Submit');
    expect(report.text()).not.toMatch(/[一-鿿]/);
  });
});
