import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

async function mountView(path = '/register') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/register', component: RegisterView },
      { path: '/login', component: { render: () => null } },
      { path: '/shards', name: 'shards', component: { render: () => null } },
    ],
  });
  await router.push(path);
  setActivePinia(createPinia());
  const w = mount(RegisterView, {
    global: { plugins: [router], stubs: { TurnstileBox: TurnstileStub, teleport: true } },
  });
  await flushPromises();
  return w;
}
type W = Awaited<ReturnType<typeof mountView>>;
/** 字段上面写标签（界面改版 P11）：按标签找到那一格（外层 .dt-auth-field） */
const fieldOf = (w: W, label: string) =>
  w.findAll('.dt-auth-field').find((x) => x.get('label').text().startsWith(label))!;
const inputOf = (w: W, label: string) => fieldOf(w, label).get('input');
const submitBtn = (w: W) => w.get('button.dt-auth-submit');

describe('RegisterView', () => {
  beforeEach(() => {
    vi.mocked(endpoints.register).mockReset();
    resetSpy.mockReset();
  });

  it('五格都写着标签；邀请码标签后面写“(可不填)”', async () => {
    const w = await mountView();
    // “(可不填)”是标签里的灰字小块，和标签之间靠样式留空
    expect(w.findAll('.dt-auth-field label').map((l) => l.text())).toEqual([
      '用户名',
      '密码',
      '确认密码',
      '邮箱',
      '邀请码(可不填)',
    ]);
    expect(fieldOf(w, '邀请码').get('.dt-auth-optional').text()).toBe('(可不填)');
  });

  it('注册失败后作废已用过的人机验证令牌，并让验证组件重新出题', async () => {
    vi.mocked(endpoints.register).mockRejectedValue(new ApiError('USERNAME_TAKEN'));
    const w = await mountView();
    await inputOf(w, '用户名').setValue('小王');
    await inputOf(w, '密码').setValue('secret123');
    await inputOf(w, '确认密码').setValue('secret123');
    await inputOf(w, '邮箱').setValue('a@b.com');
    expect(submitBtn(w).attributes('disabled')).toBeUndefined();
    await w.find('form').trigger('submit');
    await flushPromises();
    // 服务端的错写在卡片顶上
    expect(w.get('.dt-auth-card [role="alert"]').text()).toContain('这个用户名已经被注册了');
    // 注册时带上当前界面语言（问题记录 272）
    expect(endpoints.register).toHaveBeenCalledWith(expect.objectContaining({ lang: 'zh-CN' }));
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(submitBtn(w).attributes('disabled')).toBeDefined();
  });

  it('哪一格不对就在那一格下面写红字，不发请求（界面改版 P11）', async () => {
    const w = await mountView();
    await inputOf(w, '用户名').setValue('a');
    await inputOf(w, '密码').setValue('123');
    await inputOf(w, '确认密码').setValue('456');
    await inputOf(w, '邮箱').setValue('a@b.com');
    expect(fieldOf(w, '用户名').get('.dt-field-hint.is-bad').text()).toContain('用户名为 2~9 个字');
    expect(fieldOf(w, '密码').get('.dt-field-hint.is-bad').text()).toBe('密码至少 6 位');
    expect(fieldOf(w, '确认密码').get('.dt-field-hint.is-bad').text()).toBe('两次输入的密码不一致');
    expect(inputOf(w, '确认密码').attributes('aria-invalid')).toBe('true');
    // 邮箱没错：写灰字说明
    expect(fieldOf(w, '邮箱').find('.dt-field-hint.is-bad').exists()).toBe(false);
    expect(fieldOf(w, '邮箱').get('.dt-field-hint').text()).toContain('验证邮箱后才能发帖');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(endpoints.register).not.toHaveBeenCalled();
    expect(w.find('.dt-auth-card [role="alert"]').exists()).toBe(false);
  });

  it('注册成功：去切换区服页', async () => {
    vi.mocked(endpoints.register).mockResolvedValue({
      accountId: 1,
      username: '小王',
      email: 'a@b.com',
      emailVerified: false,
      role: 'player',
      shardId: null,
      restaurantId: null,
      lang: 'zh-CN',
      npcRestId: null,
    } as never);
    const w = await mountView();
    await inputOf(w, '用户名').setValue(' 小王 ');
    await inputOf(w, '密码').setValue('secret123');
    await inputOf(w, '确认密码').setValue('secret123');
    await inputOf(w, '邮箱').setValue('a@b.com');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(endpoints.register).toHaveBeenCalledWith(
      expect.objectContaining({ username: '小王', captchaToken: 't1', inviteCode: undefined }),
    );
    expect(w.vm.$router.currentRoute.value.path).toBe('/shards');
  });

  it('注册链接带邀请码（?invite=）时自动填上', async () => {
    const w = await mountView('/register?invite=ABCD2345');
    expect((inputOf(w, '邀请码').element as HTMLInputElement).value).toBe('ABCD2345');
  });
});
