import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TurnstileBox from './TurnstileBox.vue';

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.turnstile;
});

describe('TurnstileBox', () => {
  it('reset 让 Turnstile 重新出题（令牌只能用一次）', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'site-key');
    const render = vi.fn(() => 'w1');
    const reset = vi.fn();
    window.turnstile = { render, reset };
    const w = mount(TurnstileBox);
    await flushPromises();
    expect(render).toHaveBeenCalledTimes(1);
    (w.vm as unknown as { reset(): void }).reset();
    expect(reset).toHaveBeenCalledWith('w1');
  });

  it('没配置 site key 时，reset 重新给出开发用令牌', async () => {
    const w = mount(TurnstileBox);
    await flushPromises();
    expect(w.emitted('token')).toEqual([['dev-token']]);
    (w.vm as unknown as { reset(): void }).reset();
    expect(w.emitted('token')).toEqual([['dev-token'], ['dev-token']]);
  });
});
