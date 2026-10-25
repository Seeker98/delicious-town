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

type Opts = { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void };

describe('TurnstileBox 出错（防脚本 PR②）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('验证组件报错时往外发 error', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'site-key');
    let opts: Opts | null = null;
    window.turnstile = {
      render: (_el, o) => {
        opts = o as Opts;
        return 'w1';
      },
      reset: () => {},
    };
    const w = mount(TurnstileBox);
    await flushPromises();
    opts!['error-callback']!();
    expect(w.emitted('error')).toHaveLength(1);
  });

  it('脚本加载失败时往外发 error，不留没人处理的异常', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'site-key');
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')));
      return node;
    });
    const w = mount(TurnstileBox);
    await flushPromises();
    expect(w.emitted('error')).toHaveLength(1);
  });

  it('关掉时释放验证组件', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'site-key');
    const remove = vi.fn();
    window.turnstile = { render: () => 'w9', reset: () => {}, remove };
    const w = mount(TurnstileBox);
    await flushPromises();
    w.unmount();
    expect(remove).toHaveBeenCalledWith('w9');
  });

  it('脚本还没加载完就关掉：不报错', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITEKEY', 'site-key');
    let loaded: (() => void) | null = null;
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      loaded = () => {
        // 真的 Turnstile 拿不到元素会抛错
        window.turnstile = {
          render: (el) => {
            if (!el) throw new Error('no element');
            return 'w';
          },
          reset: () => {},
        };
        (node as HTMLScriptElement).onload?.(new Event('load'));
      };
      return node;
    });
    const w = mount(TurnstileBox);
    w.unmount();
    loaded!();
    await flushPromises();
    expect(w.emitted('error')).toBeUndefined();
  });
});
