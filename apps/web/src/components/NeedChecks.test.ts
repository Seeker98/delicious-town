import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import NeedChecks from './NeedChecks.vue';

describe('升星、扩油的条件清单（界面改版 P10）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('一条一行，不够的排前面；不够的现有数标红、够了的打勾', () => {
    const w = mount(NeedChecks, {
      props: {
        checks: [
          { key: 'level', need: 20, have: 25, ok: true },
          { key: 'coin', need: 100_000, have: 1_000, ok: false },
          { key: 'cookbooks', need: 30, have: 30, ok: true },
          { key: 'star', need: 2, have: 1, ok: false },
        ],
      },
    });
    const rows = w
      .findAll('[data-testid^="need-"]')
      .filter((r) => r.attributes('data-testid') !== 'need-checks');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual([
      'need-coin',
      'need-star',
      'need-level',
      'need-cookbooks',
    ]);
    const coin = w.get('[data-testid="need-coin"]');
    expect(coin.get('.dt-check-name').text()).toBe('银币');
    expect(coin.get('.dt-check-have').text()).toBe('1,000');
    expect(coin.get('.dt-check-have').classes()).toContain('text-danger');
    expect(coin.get('.dt-check-need').text()).toBe('/ 100,000');
    expect(coin.get('.dt-check-mark').classes()).toContain('is-bad');
    // 读屏念“不够”“够了”
    expect(coin.get('.visually-hidden').text()).toBe('不够');
    const level = w.get('[data-testid="need-level"]');
    expect(level.get('.dt-check-mark').text()).toBe('✓');
    expect(level.get('.dt-check-mark').classes()).toContain('is-ok');
    expect(level.get('.dt-check-have').classes()).not.toContain('text-danger');
    expect(level.get('.visually-hidden').text()).toBe('够了');
  });
});
