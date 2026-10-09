import { describe, expect, it } from 'vitest';
import { LOCALES, RANK_BOARDS, RANK_GROUPS } from '@dt/shared';
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

describe('排行榜的大类和榜名（问题记录 517：大类名按位置对应，多一个少一个后面全错位）', () => {
  it('每种语言的大类名和共用定义一样多；每个榜都有自己的名字', async () => {
    for (const l of LOCALES) {
      const rk = (await loadMessages(l)).town.rank;
      expect(rk.groups, l).toHaveLength(RANK_GROUPS.length);
      for (const b of RANK_BOARDS)
        expect(rk.boards[b.key] ?? rk.periods[b.key.split('.').at(-1) ?? ''], `${l} ${b.key}`).toBeTruthy();
    }
  }, 30_000);

  it('酒吧的榜都有自己的名字，不只写“本周 / 上周”（问题记录 569：一个游戏下面有好几种榜）', async () => {
    const bar = RANK_BOARDS.filter((b) => b.key.startsWith('bar.'));
    expect(bar.map((b) => b.group)).toEqual(
      expect.arrayContaining(['飞镖', '最后一颗糖', '秘制调料', '记忆调酒', '魔鬼辣杯', '一掷千金']),
    );
    for (const l of LOCALES) {
      const rk = (await loadMessages(l)).town.rank;
      for (const b of bar) expect(rk.boards[b.key], `${l} ${b.key}`).toBeTruthy();
    }
  }, 30_000);
});

describe('各语言的翻译（问题记录 272）', () => {
  it('每种语言的键和简中完全一致（防止用 as 绕过类型检查）', async () => {
    const base = keys(await loadMessages('zh-CN')).sort();
    for (const l of LOCALES) expect(keys(await loadMessages(l)).sort(), l).toEqual(base);
    // 要动态加载全部语言包，全量并行跑时可能超过默认 5 秒
  }, 30_000);

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
