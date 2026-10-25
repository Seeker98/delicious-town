import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { reactive } from 'vue';
import { routeLocationKey } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCaptchaStore } from '../stores/captcha';
import DtCaptchaHost from './DtCaptchaHost.vue';
import DtSheet from './DtSheet.vue';

describe('人机验证面板（防脚本 PR②）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('弹出后拿到验证令牌就交给等着的请求，面板关上', async () => {
    // 开发、测试环境没配 site key：TurnstileBox 挂上就给占位令牌
    const w = mount(DtCaptchaHost, { global: { stubs: { teleport: true } } });
    const p = useCaptchaStore().ask();
    await flushPromises();
    expect(await p).toBe('dev-token');
    expect(useCaptchaStore().open).toBe(false);
    w.unmount();
  });

  it('点关闭得到 null', async () => {
    const w = mount(DtCaptchaHost, {
      global: { stubs: { teleport: true, TurnstileBox: { template: '<div />' } } },
    });
    const p = useCaptchaStore().ask();
    await flushPromises();
    w.findComponent(DtSheet).vm.$emit('close');
    expect(await p).toBeNull();
  });

  it('只改网址参数不关框；换了页面才按关掉处理', async () => {
    const route = reactive({ path: '/a', fullPath: '/a' });
    mount(DtCaptchaHost, {
      global: {
        stubs: { teleport: true, TurnstileBox: { template: '<div />' } },
        provide: { [routeLocationKey as symbol]: route },
      },
    });
    const s = useCaptchaStore();
    const p = s.ask();
    await flushPromises();
    route.fullPath = '/a?tab=2';
    await flushPromises();
    expect(s.open).toBe(true);
    route.path = '/b';
    route.fullPath = '/b';
    await flushPromises();
    expect(s.open).toBe(false);
    expect(await p).toBeNull();
    // 换页之前发出的请求晚到：不再弹
    expect(await s.ask(Date.now() - 10_000)).toBeNull();
  });

  it('验证组件出错（加载失败等）：不留空框，等着的请求拿到 null', async () => {
    mount(DtCaptchaHost, {
      global: {
        stubs: {
          teleport: true,
          TurnstileBox: {
            emits: ['error'],
            mounted() {
              this.$emit('error');
            },
            template: '<div />',
          },
        },
      },
    });
    const p = useCaptchaStore().ask();
    await flushPromises();
    expect(await p).toBeNull();
    expect(useCaptchaStore().open).toBe(false);
  });
});
