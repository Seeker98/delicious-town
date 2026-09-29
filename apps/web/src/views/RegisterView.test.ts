import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, onMounted } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import RegisterView from './RegisterView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { register: vi.fn() } }));

const resetSpy = vi.fn();
/** 替身：挂载时给出一次令牌，并暴露 reset */
const TurnstileStub = defineComponent({
  emits: ['token'],
  setup(_, { emit, expose }) {
    expose({ reset: resetSpy });
    onMounted(() => emit('token', 't1'));
    return () => null;
  },
});

describe('RegisterView', () => {
  it('注册失败后作废已用过的人机验证令牌，并让验证组件重新出题', async () => {
    vi.mocked(endpoints.register).mockRejectedValue(new ApiError('USERNAME_TAKEN'));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: RegisterView },
        { path: '/login', component: { render: () => null } },
      ],
    });
    const w = mount(RegisterView, {
      global: { plugins: [createPinia(), router], stubs: { TurnstileBox: TurnstileStub } },
    });
    await flushPromises();
    const inputs = w.findAll('input');
    await inputs[0]!.setValue('小王');
    await inputs[1]!.setValue('secret123');
    await inputs[2]!.setValue('secret123');
    await inputs[3]!.setValue('a@b.com');
    expect(w.find('button').attributes('disabled')).toBeUndefined();
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('这个用户名已经被注册了');
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(w.find('button').attributes('disabled')).toBeDefined();
  });
});
