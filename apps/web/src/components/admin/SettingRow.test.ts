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

describe('SettingRow（问题记录 152）', () => {
  it('JSON 值的输入框占整行，按内容行数调高', () => {
    const value = [
      { id: 1, num: 2 },
      { id: 3, num: 4 },
    ];
    const w = mount(SettingRow, { props: props('json', value) });
    const box = w.find('[data-testid="setting-restaurant.giftFoods"]');
    expect(box.element.parentElement!.className).toContain('col-12');
    expect(Number(box.attributes('rows'))).toBeGreaterThanOrEqual(2);
  });

  it('数字仍然是窄输入框', () => {
    const w = mount(SettingRow, { props: props('number', 3) });
    expect(w.find('[data-testid="setting-restaurant.giftFoods"]').element.parentElement!.className).toContain(
      'col-md-3',
    );
  });
});
