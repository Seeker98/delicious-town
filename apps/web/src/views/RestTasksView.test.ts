import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ActivationDto, TaskDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import RestTasksView from './RestTasksView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    tasks: vi.fn(),
    activation: vi.fn(),
    signIn: vi.fn(),
    claimTask: vi.fn(),
    claimActivation: vi.fn(),
  },
}));

const act = (patch: Partial<ActivationDto> = {}): ActivationDto => ({
  total: 120,
  signedIn: false,
  star: 1,
  items: [
    { id: 1, name: '签到', points: 10, limit: 1, count: 1, needStar: 0 },
    { id: 2, name: '打蟑螂', points: 1, limit: 12, count: 3, needStar: 0 },
    { id: 50, name: '配送外卖', points: 5, limit: 2, count: 0, needStar: 2 },
  ],
  rewards: [
    { points: 50, award: { exp: 500 }, claimed: true, multiplier: 1 },
    { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
    { points: 150, award: { diamond: 5 }, claimed: false, multiplier: 1 },
  ],
  ...patch,
});
const task = (patch: Partial<TaskDto> = {}): TaskDto => ({
  id: 1,
  main: true,
  step: 1,
  name: '填一次油',
  href: '/',
  kind: 'counter',
  key: 'oil.fill',
  target: 1,
  progress: 0,
  done: false,
  award: { coin: 2000 },
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: RestTasksView }],
  });
  const w = mount(RestTasksView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('RestTasksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.tasks).mockResolvedValue({ mainStep: 1, main: task(), side: [] });
    vi.mocked(endpoints.activation).mockResolvedValue(act());
    vi.mocked(endpoints.signIn).mockResolvedValue({});
  });

  it('任务名、活跃项名按目录取当前语言；目录里没有时用服务端给的（问题记录 272）', async () => {
    useCatalogStore().apply({
      version: 'v:en',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      data: {
        tasks: [{ id: 1, name: 'Refill oil once' }],
        activation: [{ id: 1, name: 'Check in' }],
        bless: [],
        tower: [],
        formulas: [],
        kujiThemes: [],
        proficiency: [],
        cookbooks: [],
      },
    });
    const w = await mountView();
    expect(w.text()).toContain('Refill oil once');
    expect(w.get('[data-testid="act-1"]').text()).toContain('Check in');
    expect(w.get('[data-testid="act-2"]').text()).toContain('打蟑螂');
  });

  it('签到按钮', async () => {
    const w = await mountView();
    await w.find('[data-testid="signin"]').trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });

  it('活跃项：没做满的写进度排前面，星级不够的写几星开放，做满的标"✓ 已满"排后面（问题记录：灰色黑色分不清）', async () => {
    const w = await mountView();
    expect(w.findAll('[data-testid^="act-"]').map((x) => x.attributes('data-testid'))).toEqual([
      'act-2',
      'act-50',
      'act-1',
    ]);
    expect(w.find('[data-testid="act-2"]').text()).toContain('3/12');
    expect(w.find('[data-testid="act-50"]').text()).toContain('🔒 2 星开放');
    expect(w.find('[data-testid="act-50"]').classes()).toContain('dt-act-locked');
    expect(w.find('[data-testid="act-1"]').text()).toContain('✓ 已满');
    expect(w.find('[data-testid="act-1"]').classes()).toContain('dt-act-done');
  });

  it('活跃奖励三种样子：已领、可以领（实心）、还差几点', async () => {
    const w = await mountView();
    const claimed = w.find('[data-testid="claim-50"]');
    expect(claimed.text()).toBe('✓ 已领 50 点');
    expect(claimed.attributes('disabled')).toBeDefined();
    const ready = w.find('[data-testid="claim-100"]');
    expect(ready.text()).toBe('领 100 点奖励');
    expect(ready.classes()).toContain('btn-success');
    expect(ready.attributes('disabled')).toBeUndefined();
    const far = w.find('[data-testid="claim-150"]');
    expect(far.text()).toBe('150 点（还差 30）');
    expect(far.attributes('disabled')).toBeDefined();
  });

  it('任务卡片：没完成时显示进度条、不放按钮；完成后绿边和领奖按钮', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="task-1"]').find('.progress').exists()).toBe(true);
    expect(w.find('[data-testid="claim-task-1"]').exists()).toBe(false);
    vi.mocked(endpoints.tasks).mockResolvedValue({
      mainStep: 1,
      main: task({ progress: 1, done: true }),
      side: [],
    });
    const done = await mountView();
    expect(done.find('[data-testid="task-1"]').classes()).toContain('border-success');
    await done.find('[data-testid="claim-task-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.claimTask).toHaveBeenCalledWith(1);
  });
});
