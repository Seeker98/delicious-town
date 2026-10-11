import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CONTENT_ART, UI_ART } from './generated/names';

const ROOT = __dirname;
const svgs = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((n) => n.endsWith('.svg'))
    .map((n) => ({ name: n.slice(0, -4), src: readFileSync(join(ROOT, dir, n), 'utf8') }));
const UI = svgs('ui');
const CONTENT = svgs('content');

describe('图形（界面改版 P1，设计 §3）', () => {
  it('名字规则、48×48、没有脚本和外链', () => {
    for (const { name, src } of [...UI, ...CONTENT]) {
      expect(name, name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(src, name).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 48 48">/);
      expect(src, name).not.toMatch(/<script|<style|href=|<image|<text/i);
    }
  });

  it('每个图形和生成的雪碧图都是合法的 XML（一处写错，雪碧图里后面的图形全部不显示）', () => {
    const bad = (src: string) =>
      new DOMParser().parseFromString(src, 'image/svg+xml').getElementsByTagName('parsererror').length > 0;
    for (const { name, src } of [...UI, ...CONTENT]) expect(bad(src), name).toBe(false);
    for (const f of ['ui', 'content'])
      expect(bad(readFileSync(join(ROOT, `generated/${f}.svg`), 'utf8')), f).toBe(false);
  });

  it('界面图标只用 currentColor，不写色值、不写 fill-opacity（跟主题和深色自动变）', () => {
    for (const { name, src } of UI) {
      expect(name).toMatch(/^(nav|place|me|fac|slot|sec)-/);
      expect(src.match(/#[0-9a-fA-F]{3,6}\b/g) ?? [], name).toEqual([]);
      expect(src, name).not.toMatch(/fill-opacity/);
    }
  });

  it('内容图形以分类前缀开头', () => {
    for (const { name } of CONTENT) expect(name).toMatch(/^(res|food|goods|npc|empty|door)-/);
  });

  it('生成的名字表和源文件一致（改了图形要跑 pnpm -F @dt/web art）', () => {
    expect([...UI_ART]).toEqual(UI.map((s) => s.name).sort());
    expect([...CONTENT_ART]).toEqual(CONTENT.map((s) => s.name).sort());
    const all = [...UI_ART, ...CONTENT_ART];
    expect(new Set(all).size).toBe(all.length);
  });

  it('头图（界面改版 P3）：名字规则、320×72、没有脚本和外链', () => {
    const scenes = readdirSync(join(ROOT, 'scene')).filter((n) => n.endsWith('.svg'));
    expect(scenes).toContain('restaurant.svg');
    for (const n of scenes) {
      const src = readFileSync(join(ROOT, 'scene', n), 'utf8');
      expect(n.slice(0, -4), n).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(src.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 72">'), n).toBe(true);
      expect(src, n).not.toMatch(/<script|<style|href=|<image|<text/i);
    }
  });

  it('配置里每扇门都有图形 door-<art>（Review Focus 3）', () => {
    const looks = JSON.parse(
      readFileSync(join(ROOT, '../../../../packages/config/data/game/looks.json'), 'utf8'),
    ) as {
      doors: Array<{ art: string }>;
    };
    for (const d of looks.doors) expect(CONTENT_ART, d.art).toContain(`door-${d.art}`);
  });

  it('体积上限：两张雪碧图压缩后合计 ≤ 25KB，加上头图 ≤ 120KB（设计 §3.5）', () => {
    const gz = (p: string) => gzipSync(readFileSync(p)).length;
    const sprites = gz(join(ROOT, 'generated/ui.svg')) + gz(join(ROOT, 'generated/content.svg'));
    expect(sprites).toBeLessThanOrEqual(25 * 1024);
    let scenes = 0;
    try {
      for (const n of readdirSync(join(ROOT, 'scene'))) scenes += gz(join(ROOT, 'scene', n));
    } catch {
      // 头图在 P3 以后才有
    }
    expect(sprites + scenes).toBeLessThanOrEqual(120 * 1024);
  });
});
