import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import FloorPanel from './FloorPanel.vue';
import { duelResult, towerData, towerFloor } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { towerChallenge: vi.fn() } }));

describe('FloorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.towerChallenge).mockResolvedValue(duelResult());
  });

  it('守塔人店名、称号、台词按目录取当前语言（问题记录 272）', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: {
        tasks: [],
        activation: [],
        bless: [],
        tower: [
          { id: 1, name: 'Apprentice Model Restaurant', title: 'Apprentice Guardian', note: 'Bring it on' },
        ],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const text = mount(FloorPanel, { props: { data: towerData() } })
      .get('[data-testid="floor-1"]')
      .text();
    expect(text).toContain('Apprentice Model Restaurant');
    expect(text).toContain('Apprentice Guardian');
    expect(text).toContain('Bring it on');
    expect(text).not.toContain('守塔人1');
  });

  it('挑战后显示对决结果并通知刷新；试打按 test = true 调用', async () => {
    const w = mount(FloorPanel, { props: { data: towerData() } });
    await w.find('[data-testid="tc-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.towerChallenge).toHaveBeenCalledWith(1, false);
    expect(w.find('[data-testid="duel-result"]').exists()).toBe(true);
    expect(w.emitted('reload')).toHaveLength(1);
    await w.find('[data-testid="tp-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.towerChallenge).toHaveBeenLastCalledWith(1, true);
  });

  it('不能挑战时写明原因：等级不够、没打赢下一层、夜间、次数用完（试打仍可用）、体力不够', () => {
    const w = mount(FloorPanel, {
      props: {
        data: towerData({
          level: 15,
          hour: 3,
          floors: [
            towerFloor(1, { unlocked: true }),
            towerFloor(2, { unlocked: false }),
            towerFloor(3),
            towerFloor(4, { unlocked: true }),
          ],
        }),
      },
    });
    expect(w.find('[data-testid="block-2"]').text()).toBe('先打赢第 1 层');
    expect(w.find('[data-testid="block-3"]').text()).toBe('餐厅 21 级才能挑战');
    expect(w.find('[data-testid="block-4"]').text()).toBe('4 层以上 6 点以后才能挑战');
    expect(w.find('[data-testid="tc-4"]').attributes('disabled')).toBeDefined();
    const used = mount(FloorPanel, { props: { data: towerData({ left: 0 }) } });
    expect(used.find('[data-testid="block-1"]').text()).toBe('今天的挑战次数用完了');
    expect(used.find('[data-testid="tc-1"]').attributes('disabled')).toBeDefined();
    expect(used.find('[data-testid="tp-1"]').attributes('disabled')).toBeUndefined();
    const tired = mount(FloorPanel, { props: { data: towerData({ strength: 3 }) } });
    expect(tired.find('[data-testid="block-1"]').text()).toBe('体力不够（要 5）');
  });
});

describe('问题记录 230：次数提示用对手的名字', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('写"今天还能挑战某某"，不写"他"', () => {
    const data = towerData();
    const w = mount(FloorPanel, { props: { data } });
    const f = data.floors[0]!;
    expect(w.find(`[data-testid="floor-${f.floor}"]`).text()).toContain(`今天还能挑战${f.name}`);
    expect(w.text()).not.toContain('挑战他');
  });
});
