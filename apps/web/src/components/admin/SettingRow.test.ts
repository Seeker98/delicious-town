import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingRow from './SettingRow.vue';

const props = (kind: 'number' | 'json', value: unknown) => ({
  path: 'restaurant.giftFoods',
  kind,
  def: value,
  value,
  effective: value,
  overridden: false,
  readOnly: false,
  error: false,
});

/** 一行是表格里的 tr（界面改版 P12）：挂在表格里测 */
const mountRow = (p: ReturnType<typeof props> & { doc?: string }) =>
  mount({
    components: { SettingRow },
    data: () => ({ p }),
    template: '<table><tbody><SettingRow v-bind="p" /></tbody></table>',
  });

describe('SettingRow（问题记录 152）', () => {
  it('JSON 值的输入框占两格，按内容行数调高', () => {
    const value = [
      { id: 1, num: 2 },
      { id: 3, num: 4 },
    ];
    const w = mountRow(props('json', value));
    const box = w.find('[data-testid="setting-restaurant.giftFoods"]');
    expect(box.element.parentElement!.getAttribute('colspan')).toBe('2');
    expect(Number(box.attributes('rows'))).toBeGreaterThanOrEqual(2);
  });

  it('数字仍然是窄输入框', () => {
    const w = mountRow(props('number', 3));
    const cell = w.find('[data-testid="setting-restaurant.giftFoods"]').element.parentElement!;
    expect(cell.getAttribute('colspan')).toBeNull();
    expect(cell.className).toContain('dt-adm-set-val');
  });

  it('字段名下面显示说明（问题记录 126）', () => {
    const w = mountRow({ ...props('number', 3), doc: '新店银币' });
    expect(w.find('[data-testid="doc-restaurant.giftFoods"]').text()).toBe('新店银币');
  });
});
