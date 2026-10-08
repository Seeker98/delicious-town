import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOADERS } from '../i18n';
import { endpoints } from '../api/endpoints';
import { useLocaleStore } from '../stores/locale';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import LangSelect from './LangSelect.vue';

/**
 * 第一次切到某种语言要动态加载翻译包：全量并行跑时 Vite 要现场编译大量文件，可能超过 10 秒（backlog 测试不稳定）。
 * 等待放宽到 40 秒，用例超时放宽到 60 秒
 */
const LOAD = { timeout: 40_000 };
vi.setConfig({ testTimeout: 60_000 });

vi.mock('../api/endpoints', () => ({ endpoints: { setLang: vi.fn(), me: vi.fn(), logout: vi.fn() } }));

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

describe('语言选择（问题记录 272）', () => {
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

  it('列出五种语言；没登录时选了只在浏览器生效，不存账号', async () => {
    const w = mount(LangSelect);
    const opts = w.findAll('option').map((o) => o.text());
    expect(opts).toEqual(['简体中文', '繁體中文', 'English', 'Français', 'Español']);
    await w.get('[data-testid="lang-select"]').setValue('en');
    // 第一次切到某种语言要动态加载翻译包
    await vi.waitFor(() => expect(useLocaleStore().locale).toBe('en'), LOAD);
    await flushPromises();
    expect(endpoints.setLang).not.toHaveBeenCalled();
  });

  it('登录后选了同时存到账号', async () => {
    // 组件和断言都用这个用例自己的 Pinia，不依赖"当前 Pinia"（前面用例的计时器可能把它切走）
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).me = me('zh-CN');
    const w = mount(LangSelect);
    await w.get('[data-testid="lang-select"]').setValue('fr');
    await vi.waitFor(() => expect(endpoints.setLang).toHaveBeenCalledWith('fr'), LOAD);
    expect(useLocaleStore(pinia).locale).toBe('fr');
  });

  it('翻译包加载失败：提示，语言不变', async () => {
    vi.spyOn(LOADERS, 'es').mockRejectedValueOnce(new Error('offline'));
    const w = mount(LangSelect);
    await w.get('[data-testid="lang-select"]').setValue('es');
    await flushPromises();
    expect(useLocaleStore().locale).toBe('zh-CN');
    expect(useToastStore().items.at(-1)!.text).toBe('切换语言失败, 请检查网络后再试');
    expect((w.get('[data-testid="lang-select"]').element as HTMLSelectElement).value).toBe('zh-CN');
  });
});

describe('登录后用账号语言（问题记录 272）', () => {
  /**
   * 开头就取好 store：await 期间前面用例留下的提示计时器会在旧 Pinia 上跑 action、把活动 Pinia 换回旧的，
   * 之后再调 useLocaleStore() 会拿到旧 store（全量并行跑、加载语言包慢时偶发）
   */
  let locale: ReturnType<typeof useLocaleStore>;
  let session: ReturnType<typeof useSessionStore>;
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    locale = useLocaleStore();
    session = useSessionStore();
    vi.mocked(endpoints.setLang).mockResolvedValue({ lang: 'zh-CN' } as never);
  });
  afterEach(async () => {
    await locale.set('zh-CN');
    locale.clearPick();
  });

  it('账号设过语言：切过去，不再存', async () => {
    await session.applyMe(me('es'));
    expect(locale.locale).toBe('es');
    expect(endpoints.setLang).not.toHaveBeenCalled();
  });

  it('账号没设过（多语言上线前的老账号，都是中文玩家）或值不合法：用简中并存到账号，不按浏览器语言', async () => {
    await locale.set('en');
    await session.applyMe(me(null));
    expect(locale.locale).toBe('zh-CN');
    expect(endpoints.setLang).toHaveBeenCalledWith('zh-CN');
    vi.clearAllMocks();
    await session.applyMe(me('klingon'));
    expect(endpoints.setLang).toHaveBeenCalledWith('zh-CN');
  });

  it('没登录时在登录页手动选的语言：登录后以它为准存到账号，只生效一次', async () => {
    const w = mount(LangSelect);
    await w.get('[data-testid="lang-select"]').setValue('fr');
    await vi.waitFor(() => expect(locale.locale).toBe('fr'), { timeout: 10_000 });
    await session.applyMe(me('es'));
    expect(locale.locale).toBe('fr');
    expect(endpoints.setLang).toHaveBeenCalledWith('fr');
    // 手选已经存到账号，之后读到账号语言照常跟随（比如在别的设备改过）
    vi.clearAllMocks();
    await session.applyMe(me('es'));
    expect(locale.locale).toBe('es');
    expect(endpoints.setLang).not.toHaveBeenCalled();
  });

  it('load() 读到账号后同样处理', async () => {
    vi.mocked(endpoints.me).mockResolvedValue(me('fr'));
    await session.load();
    expect(locale.locale).toBe('fr');
  });
});

describe('backlog 多语言：存到账号、跟随账号失败时提示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await useLocaleStore().set('zh-CN');
  });

  it('登录状态下切了语言、存到账号失败：提示下次刷新会回到原来的语言', async () => {
    vi.mocked(endpoints.setLang).mockRejectedValue(new Error('500'));
    // 组件和断言都用这个用例自己的 Pinia，不依赖"当前 Pinia"（前面用例的计时器可能把它切走）
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore(pinia).me = me('zh-CN');
    const w = mount(LangSelect);
    await w.get('[data-testid="lang-select"]').setValue('fr');
    await vi.waitFor(() => expect(endpoints.setLang).toHaveBeenCalledWith('fr'), LOAD);
    // 提示按刚切过去的语言显示；存账号失败后才推提示，全量并行跑时一次 flush 可能还没到（偶发）
    await vi.waitFor(
      () =>
        expect(useToastStore(pinia).items.map((x) => x.text)).toContain(
          "Langue changée, mais elle n'a pas pu être enregistrée sur votre compte. Elle reviendra après actualisation.",
        ),
      LOAD,
    );
  });

  it('登录后跟随账号语言、翻译包加载失败：提示，先用当前语言', async () => {
    vi.spyOn(LOADERS, 'zh-TW').mockRejectedValueOnce(new Error('offline'));
    await useSessionStore().applyMe(me('zh-TW'));
    expect(useLocaleStore().locale).toBe('zh-CN');
    expect(useToastStore().items.map((x) => x.text)).toContain('切换语言失败, 请检查网络后再试');
  });
});
