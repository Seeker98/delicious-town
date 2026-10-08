import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AccountProfileDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import AccountView from './AccountView.vue';
import { useRestaurantStore } from '../stores/restaurant';
import type { RestaurantDto } from '@dt/shared';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    accountProfile: vi.fn(),
    changePassword: vi.fn(),
    sendVerifyEmail: vi.fn(),
    selectShard: vi.fn(),
    logout: vi.fn(),
  },
}));

const profile = (patch: Partial<AccountProfileDto> = {}): AccountProfileDto => ({
  username: 'u1',
  email: 'u@x',
  emailVerified: true,
  role: 'player',
  createdAt: '2026-09-30T00:00:00Z',
  inviteCode: null,
  rests: [{ shardId: 1, shardName: '一服', shardOpen: true, restId: 5, name: '小店', level: 12 }],
  ...patch,
});
const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', name: 'home', component: AccountView }],
  });
  const w = mount(AccountView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
};
const fill = async (w: Awaited<ReturnType<typeof mountView>>, a: string, b: string, c: string) => {
  await w.find('[data-testid="acc-old"]').setValue(a);
  await w.find('[data-testid="acc-new"]').setValue(b);
  await w.find('[data-testid="acc-new2"]').setValue(c);
  await w.find('[data-testid="acc-change"]').trigger('click');
  await flushPromises();
};

describe('AccountView（问题记录 178）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.changePassword).mockReset();
  });

  it('显示用户名、各区服的店；邮箱未验证时有重发按钮；普通玩家不显示身份', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile({ emailVerified: false }));
    const w = await mountView();
    expect(w.text()).toContain('u1');
    expect(w.find('[data-testid="acc-rest-1"]').text()).toContain('小店');
    expect(w.find('[data-testid="acc-resend"]').exists()).toBe(true);
    expect(w.text()).not.toContain('管理员');
  });

  it('账号信息排成整齐的两列：左边标签、右边内容，语言下拉框也在右列（问题记录 300）', async () => {
    const w = await mountView();
    const info = w.get('[data-testid="acc-info"]');
    expect(info.classes()).toContain('dt-kv');
    expect(info.findAll('dt').map((x) => x.text())).toEqual(['语言', '用户名', '注册时间', '邮箱', '邀请码']);
    expect(info.findAll('dd')).toHaveLength(5);
    expect(info.findAll('dd')[0]!.find('select').exists()).toBe(true);
    expect(info.findAll('dd')[1]!.text()).toContain('u1');
  });

  it('当前区服关了邀请：不显示邀请码这一行（#189 遗留：它是唯一入口）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['invite'] } as unknown as RestaurantDto;
    const w = await mountView();
    const info = w.get('[data-testid="acc-info"]');
    expect(info.findAll('dt').map((x) => x.text())).toEqual(['语言', '用户名', '注册时间', '邮箱']);
  });

  it('两次新密码不一致：不发请求', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    const w = await mountView();
    await fill(w, 'secret123', 'newpass123', 'newpass999');
    expect(endpoints.changePassword).not.toHaveBeenCalled();
    expect(w.text()).toContain('两次输入的新密码不一样');
  });

  it('改密码成功：提示其他设备已下线，清空输入', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    vi.mocked(endpoints.changePassword).mockResolvedValue({});
    const w = await mountView();
    await fill(w, 'secret123', 'newpass123', 'newpass123');
    expect(endpoints.changePassword).toHaveBeenCalledWith({
      oldPassword: 'secret123',
      newPassword: 'newpass123',
    });
    expect(w.text()).toContain('其他设备已下线');
    expect((w.find('[data-testid="acc-old"]').element as HTMLInputElement).value).toBe('');
  });
});

describe('backlog 账号：改密码后要重新登录', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.changePassword).mockReset();
  });
  it('服务端返回 relogin：提示密码已改、请用新密码重新登录，并跳到登录页', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    vi.mocked(endpoints.changePassword).mockResolvedValue({ relogin: true } as never);
    const w = await mountView();
    await fill(w, 'secret123', 'newpass123', 'newpass123');
    await flushPromises();
    expect(useToastStore().items.at(-1)?.text).toBe('密码已修改, 请用新密码重新登录');
    expect(useSessionStore().me).toBeNull();
  });

  it('进入别的区服：会话里换成那个区服的蟹老板店编号（backlog 第 ⑦ 批审查）', async () => {
    vi.mocked(endpoints.accountProfile).mockResolvedValue(profile());
    vi.mocked(endpoints.selectShard).mockResolvedValue({ shardId: 1, restaurantId: 5, npcRestId: 99 });
    useSessionStore().me = {
      accountId: 1,
      username: 'u1',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 2,
      restaurantId: 8,
      lang: null,
      npcRestId: 3,
    };
    const w = await mountView();
    await w.get('[data-testid="acc-rest-1"] button').trigger('click');
    await flushPromises();
    expect(useSessionStore().me).toMatchObject({ shardId: 1, restaurantId: 5, npcRestId: 99 });
  });
});
