import { describe, expect, it } from 'vitest';
import { LOCALES } from '@dt/shared';
import { convertZhTw } from '../../scripts/gen-zh-tw.mjs';
import { loadMessages } from '.';
import overrides from './zh-TW-overrides.json';

const ZH_CN = import.meta.glob<string>('./locales/zh-CN/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const ZH_TW = import.meta.glob<string>('./locales/zh-TW/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** 对象的键路径（值是函数时只看到这一层） */
function keys(o: unknown, prefix = ''): string[] {
  if (o === null || typeof o !== 'object') return [prefix];
  return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('各语言的翻译（问题记录 272）', () => {
  it('每种语言的键和简中完全一致（防止用 as 绕过类型检查）', async () => {
    const base = keys(await loadMessages('zh-CN')).sort();
    for (const l of LOCALES) expect(keys(await loadMessages(l)).sort(), l).toEqual(base);
  });

  it('繁中是由简中生成的最新结果：改了简中要跑 pnpm -F @dt/web i18n:tw', () => {
    expect(Object.keys(ZH_TW).sort()).toEqual(
      Object.keys(ZH_CN)
        .map((p) => p.replace('/zh-CN/', '/zh-TW/'))
        .sort(),
    );
    for (const [path, src] of Object.entries(ZH_CN))
      expect(ZH_TW[path.replace('/zh-CN/', '/zh-TW/')], path).toBe(
        convertZhTw(src, overrides as Array<[string, string]>),
      );
  });

  it('转换示例：用台湾用词', () => {
    expect(convertZhTw("a: '加载中，网络'", [])).toContain('載入中，網路');
  });
});
