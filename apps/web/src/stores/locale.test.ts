import { createPinia, setActivePinia } from 'pinia';
import { isReactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Messages } from '../i18n';
import zhCN from '../i18n/locales/zh-CN';

/** 可控的翻译包加载：每次调用返回一个由测试决定何时完成的 promise */
const pending: Array<{ l: string; resolve: (m: Messages) => void; reject: (e: unknown) => void }> = [];
vi.mock('../i18n', async (orig) => {
  const real = await orig<typeof import('../i18n')>();
  return {
    ...real,
    loadMessages: vi.fn(
      (l: string) => new Promise<Messages>((resolve, reject) => pending.push({ l, resolve, reject })),
    ),
  };
});
vi.mock('./catalog', () => ({ useCatalogStore: () => ({ loaded: false }) }));

const { page, useLocaleStore } = await import('./locale');
const fake = (tag: string) => ({ ...zhCN, common: { ...zhCN.common, ok: tag } }) as Messages;

describe('backlog 多语言：语言切换', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    pending.length = 0;
    sessionStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('快速连切两种语言：以最后选的为准，先选的后加载完也不覆盖', async () => {
    const s = useLocaleStore();
    const first = s.set('en');
    const second = s.set('fr');
    pending[1]!.resolve(fake('fr'));
    expect(await second).toBe('ok');
    pending[0]!.resolve(fake('en'));
    expect(await first).toBe('stale');
    expect(s.locale).toBe('fr');
  });

  it('加载失败返回 failed，语言不变', async () => {
    const s = useLocaleStore();
    const p = s.set('en');
    pending[0]!.reject(new Error('network'));
    expect(await p).toBe('failed');
    expect(s.locale).toBe('zh-CN');
  });

  it('部署后旧文件 404（动态导入失败）：自动刷新一次；刷新后还失败就不再刷新', async () => {
    const reload = vi.spyOn(page, 'reload').mockImplementation(() => {});
    const s = useLocaleStore();
    let p = s.set('en');
    pending[0]!.reject(new TypeError('Failed to fetch dynamically imported module: /assets/en-abc.js'));
    await p;
    expect(reload).toHaveBeenCalledTimes(1);
    p = s.set('en');
    pending[1]!.reject(new TypeError('Failed to fetch dynamically imported module: /assets/en-abc.js'));
    expect(await p).toBe('failed');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('翻译包不被深度响应化', async () => {
    const s = useLocaleStore();
    const p = s.set('en');
    pending[0]!.resolve(fake('en'));
    await p;
    expect(isReactive(s.messages)).toBe(false);
  });

  it('启动时翻译包一直加载不完：超时后照常挂载（以前白屏）', async () => {
    vi.useFakeTimers();
    try {
      const s = useLocaleStore();
      let done = false;
      void s.initWithin(3000).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(2999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
