import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHANGELOG } from '../data/changelog';
import ChangelogView from './ChangelogView.vue';

describe('ChangelogView（问题记录 348）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('按日期分组，从新到旧，每条一句话', () => {
    const w = mount(ChangelogView);
    const days = w.findAll('[data-testid^="cl-day-"]').map((x) => x.attributes('data-testid'));
    expect(days[0]).toBe(`cl-day-${CHANGELOG[0]!.date}`);
    expect(new Set(days).size).toBe(days.length);
    expect(w.findAll('[data-testid="cl-item"]')).toHaveLength(CHANGELOG.length);
    expect(w.text()).toContain('小镇发展基金');
  });
});
