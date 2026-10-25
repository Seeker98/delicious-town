import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
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
});
