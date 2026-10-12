import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOADERS } from '../../i18n';
import { endpoints } from '../../api/endpoints';
import { useLocaleStore } from '../../stores/locale';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import LangSheet from './LangSheet.vue';

/**
 * 第一次切到某种语言要动态加载翻译包：全量并行跑时 Vite 要现场编译大量文件，可能超过 10 秒（和以前的语言下拉框测试一样放宽）。
 * 等待放宽到 40 秒，用例超时放宽到 60 秒
 */
const LOAD = { timeout: 40_000 };
vi.setConfig({ testTimeout: 60_000 });

vi.mock('../../api/endpoints', () => ({ endpoints: { setLang: vi.fn(), me: vi.fn(), logout: vi.fn() } }));

const me = (lang: string | null) =>
  ({
    accountId: 1,
    username: 'u',
    email: 'u@x',
    emailVerified: true,
    role: 'player',
    shardId: null,
    restaurantId: null,
    lang,
  }) as never;
/** 面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P11） */
const mountSheet = () => mount(LangSheet, { props: { open: true }, global: { stubs: { teleport: true } } });

describe('语言面板（问题记录 272；界面改版 P11 从下拉框挪到面板）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.setLang).mockResolvedValue({ lang: 'fr' } as never);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await useLocaleStore().set('zh-CN');
    useLocaleStore().clearPick();
  });

  it('一行一种语言，用那种语言自己的写法；当前语言选中', () => {
    const w = mountSheet();
    const rows = w.findAll('[role="radio"]');
    expect(rows.map((r) => r.get('.dt-pick-title').text())).toEqual([
      '简体中文',
      '繁體中文',
      'English',
      'Français',
      'Español',
    ]);
    expect(w.get('[data-testid="lang-zh-CN"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="lang-en"]').attributes('aria-checked')).toBe('false');
  });

  it('点当前语言：直接关掉面板，不重新加载', async () => {
    const w = mountSheet();
    await w.get('[data-testid="lang-zh-CN"]').trigger('click');
    await flushPromises();
    expect(w.emitted('close')).toHaveLength(1);
    expect(endpoints.setLang).not.toHaveBeenCalled();
  });

  it('没登录时选了只在浏览器生效，不存账号；换好后关掉面板', async () => {
    const w = mountSheet();
    await w.get('[data-testid="lang-en"]').trigger('click');
    // 第一次切到某种语言要动态加载翻译包
    await vi.waitFor(() => expect(useLocaleStore().locale).toBe('en'), LOAD);
    await flushPromises();
    expect(endpoints.setLang).not.toHaveBeenCalled();
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('登录后选了同时存到账号', async () => {
    // 组件和断言都用这个用例自己的 Pinia，不依赖“当前 Pinia”（前面用例的计时器可能把它切走）
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).me = me('zh-CN');
    const w = mountSheet();
    await w.get('[data-testid="lang-fr"]').trigger('click');
    await vi.waitFor(() => expect(endpoints.setLang).toHaveBeenCalledWith('fr'), LOAD);
    expect(useLocaleStore(pinia).locale).toBe('fr');
  });

  it('翻译包加载失败：提示，语言不变，面板不关', async () => {
    vi.spyOn(LOADERS, 'es').mockRejectedValueOnce(new Error('offline'));
    const w = mountSheet();
    await w.get('[data-testid="lang-es"]').trigger('click');
    await flushPromises();
    expect(useLocaleStore().locale).toBe('zh-CN');
    expect(useToastStore().items.at(-1)!.text).toBe('切换语言失败, 请检查网络后再试');
    expect(w.emitted('close')).toBeUndefined();
    expect(w.get('[data-testid="lang-zh-CN"]').attributes('aria-checked')).toBe('true');
  });

  it('登录状态下存到账号失败：提示下次刷新会回到原来的语言（backlog 多语言）', async () => {
    vi.mocked(endpoints.setLang).mockRejectedValue(new Error('500'));
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).me = me('zh-CN');
    const w = mountSheet();
    await w.get('[data-testid="lang-fr"]').trigger('click');
    await vi.waitFor(() => expect(endpoints.setLang).toHaveBeenCalledWith('fr'), LOAD);
    // 提示按刚切过去的语言显示
    await vi.waitFor(
      () =>
        expect(useToastStore(pinia).items.map((x) => x.text)).toContain(
          "Langue changée, mais elle n'a pas pu être enregistrée sur votre compte. Elle reviendra après actualisation.",
        ),
      LOAD,
    );
  });
});
