import type { Locale } from '@dt/shared';
import { CHANGELOG, type ChangelogId } from '../../data/changelog';

/**
 * 更新记录的文案：每个 PR 加一条、越积越多，单独按语言分包，打开更新记录、帮助中心时才加载（不打进主包）。
 * 加一条 = data/changelog.ts 加 id 和日期 + 这里每种语言的文件加一句；繁中由 pnpm -F @dt/web i18n:tw 生成
 */
export type ChangelogTexts = Record<ChangelogId, string>;

const LOADERS: Record<Locale, () => Promise<{ default: ChangelogTexts }>> = {
  'zh-CN': () => import('./zh-CN'),
  'zh-TW': () => import('./zh-TW'),
  en: () => import('./en'),
  fr: () => import('./fr'),
  es: () => import('./es'),
};
const cache = new Map<Locale, ChangelogTexts>();

/** 已经加载过的（没加载过为 undefined）：组件挂载时先拿它，不用等一轮 */
export const cachedChangelog = (l: Locale): ChangelogTexts | undefined => cache.get(l);

/** 加载某种语言的更新记录；缺的条目用简中补上 */
export async function loadChangelog(l: Locale): Promise<ChangelogTexts> {
  const hit = cache.get(l);
  if (hit) return hit;
  let texts = (await LOADERS[l]()).default;
  if (l !== 'zh-CN' && CHANGELOG.some((x) => !texts[x.id]))
    texts = { ...(await loadChangelog('zh-CN')), ...texts };
  cache.set(l, texts);
  return texts;
}
