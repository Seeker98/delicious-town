import { mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
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
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    // 加载语言包期间别的计时器可能把活动 Pinia 换成旧的（见 LangSheet.test），挂载前换回来
    setActivePinia(pinia);
    const grid = mount(TableGrid, {
      props: { tables: [table(1, 1, 9, { freeloaderName: 'Bob' }), table(2, 2, 2)] },
    });
    expect(grid.text()).toContain('Floor 1');
    // 界面改版 P7：格子里一行“Freeloader”、一行名字；汇总写“Floor 1: 1 table · 1 freeloading”
    expect(grid.get('[data-testid="table-1"] .dt-table-main').text()).toBe('Freeloader');
    expect(grid.get('[data-testid="table-1"] .dt-table-who').text()).toBe('Bob');
    expect(grid.get('[data-testid="floor-summary"]').text()).toBe('Floor 1: 1 table · 1 freeloading');
    const report = mount(ReportButton, { props: { targetType: 'post', targetId: 1 } });
    expect(report.find('[data-testid="report-open"]').text()).toBe('Report');
    await report.find('[data-testid="report-open"]').trigger('click');
    expect(report.text()).toContain('Abuse');
    expect(report.text()).toContain('Submit');
    expect(report.text()).not.toMatch(/[一-鿿]/);
  });
});
