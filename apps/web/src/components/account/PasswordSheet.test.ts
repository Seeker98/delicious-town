import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import PasswordSheet from './PasswordSheet.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { changePassword: vi.fn() } }));

const mountSheet = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  // 面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P11）
  const w = mount(PasswordSheet, {
    props: { open: true },
    global: { plugins: [router], stubs: { teleport: true } },
  });
  return { w, router };
};
const fill = async (w: Awaited<ReturnType<typeof mountSheet>>['w'], a: string, b: string, c: string) => {
  await w.get('[data-testid="acc-old"]').setValue(a);
  await w.get('[data-testid="acc-new"]').setValue(b);
  await w.get('[data-testid="acc-new2"]').setValue(c);
};
const submit = async (w: Awaited<ReturnType<typeof mountSheet>>['w']) => {
  await w.get('form').trigger('submit');
  await flushPromises();
};

describe('修改密码面板（问题记录 178；界面改版 P11 从账号页挪进面板）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.changePassword).mockReset();
  });

  it('两次新密码不一致：第二格下面写红字、按钮灰掉，不发请求', async () => {
    const { w } = await mountSheet();
    await fill(w, 'secret123', 'newpass123', 'newpass999');
    expect(w.text()).toContain('两次输入的新密码不一样');
    expect(w.get('[data-testid="acc-new2"]').attributes('aria-invalid')).toBe('true');
    expect(w.get('[data-testid="acc-change"]').attributes('disabled')).toBeDefined();
    await submit(w);
    expect(endpoints.changePassword).not.toHaveBeenCalled();
  });

  it('新密码不到 6 位：按钮灰掉', async () => {
    const { w } = await mountSheet();
    await fill(w, 'secret123', 'abc', 'abc');
    expect(w.get('[data-testid="acc-new"]').attributes('aria-invalid')).toBe('true');
    expect(w.get('[data-testid="acc-change"]').attributes('disabled')).toBeDefined();
  });

  it('改密码成功：提示其他设备已下线，面板关掉', async () => {
    vi.mocked(endpoints.changePassword).mockResolvedValue({});
    const { w } = await mountSheet();
    await fill(w, 'secret123', 'newpass123', 'newpass123');
    expect(w.get('[data-testid="acc-change"]').attributes('disabled')).toBeUndefined();
    await submit(w);
    expect(endpoints.changePassword).toHaveBeenCalledWith({
      oldPassword: 'secret123',
      newPassword: 'newpass123',
    });
    expect(useToastStore().items.at(-1)?.text).toBe('密码已修改, 其他设备已下线');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('服务端返回 relogin：提示用新密码重新登录、清掉会话并跳到登录页（backlog 账号）', async () => {
    vi.mocked(endpoints.changePassword).mockResolvedValue({ relogin: true } as never);
    useSessionStore().me = { accountId: 1, username: 'u1' } as never;
    const { w, router } = await mountSheet();
    await fill(w, 'secret123', 'newpass123', 'newpass123');
    await submit(w);
    expect(useToastStore().items.at(-1)?.text).toBe('密码已修改, 请用新密码重新登录');
    expect(useSessionStore().me).toBeNull();
    expect(router.currentRoute.value.path).toBe('/login');
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('旧密码不对：错误写在旧密码那一格下面，面板不关', async () => {
    vi.mocked(endpoints.changePassword).mockRejectedValue(new ApiError('UNAUTHORIZED', {}));
    const { w } = await mountSheet();
    await fill(w, 'wrong123', 'newpass123', 'newpass123');
    await submit(w);
    expect(w.get('[data-testid="acc-old"]').attributes('aria-invalid')).toBe('true');
    expect(w.find('.dt-field-hint.is-bad').text()).not.toBe('');
    expect(w.emitted('close')).toBeUndefined();
  });

  it('重新打开时清空上次的输入', async () => {
    const { w } = await mountSheet();
    await fill(w, 'secret123', 'newpass123', 'newpass123');
    await w.setProps({ open: false });
    await w.setProps({ open: true });
    expect((w.get('[data-testid="acc-old"]').element as HTMLInputElement).value).toBe('');
    expect((w.get('[data-testid="acc-new2"]').element as HTMLInputElement).value).toBe('');
  });
});
