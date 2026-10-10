/**
 * 深色模式（界面改版设计 §2.2）：跟随系统 / 浅色 / 深色，只存在本机。
 * 页面渲染前 index.html 的内联脚本已按同样规则写好 data-theme，这里负责运行中切换和跟随系统。
 */
export type ThemePref = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';
export const THEME_KEY = 'dt_theme';
/** 地址栏颜色：和顶栏一致 */
export const THEME_COLOR: Record<ThemeMode, string> = { light: '#ffffff', dark: '#211b2a' };
const QUERY = '(prefers-color-scheme: dark)';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function systemDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function resolveTheme(pref: ThemePref, sysDark: boolean): ThemeMode {
  return pref === 'system' ? (sysDark ? 'dark' : 'light') : pref;
}

export function applyTheme(mode: ThemeMode, doc: Document = document): void {
  const html = doc.documentElement;
  html.dataset.theme = mode;
  html.setAttribute('data-bs-theme', mode);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[mode]);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // 存不了（隐私模式）也照样切换，只是下次打开不记得
  }
  applyTheme(resolveTheme(pref, systemDark()));
}

/** 选了“跟随系统”时，系统切换深浅色立刻跟着变；返回取消监听的函数 */
export function installThemeWatcher(): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  const onChange = (e: { matches: boolean }) => {
    if (readThemePref() === 'system') applyTheme(e.matches ? 'dark' : 'light');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
