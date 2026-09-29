import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
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

describe('RestTasksView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.tasks).mockResolvedValue({ mainStep: 1, main: null, side: [] });
    vi.mocked(endpoints.activation).mockResolvedValue({
      total: 55,
      signedIn: false,
      items: [{ id: 1, name: '签到', points: 10, limit: 1, count: 0, needStar: 0 }],
      rewards: [
        { points: 50, award: { exp: 500 }, claimed: false, multiplier: 1 },
        { points: 100, award: { diamond: 2 }, claimed: false, multiplier: 1 },
      ],
    });
    vi.mocked(endpoints.signIn).mockResolvedValue({});
  });

  it('签到按钮；够分的档位可以领，不够的禁用', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: RestTasksView }],
    });
    const w = mount(RestTasksView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.find('[data-testid="claim-50"]').attributes('disabled')).toBeUndefined();
    expect(w.find('[data-testid="claim-100"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="signin"]').trigger('click');
    await flushPromises();
    expect(endpoints.signIn).toHaveBeenCalled();
  });
});
