import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import zh from './locales/zh-CN/common';
import fr from './locales/fr/common';

/** 一行里插值（或标签）后面紧跟“×插值”，即写死的“名字×数量” */
const STUCK = /(\}\}|\}|<\/\w+>) ?×(\{\{|\$\{)/;

describe('名字×数量（backlog #116）', () => {
  it('法文两边加空格，中文紧挨着', () => {
    expect(fr.qty('Riz', 3)).toBe('Riz × 3');
    expect(fr.times).toBe(' × ');
    expect(zh.qty('大米', 3)).toBe('大米×3');
  });

  it('法文文案里不再有紧挨着的“名字×数量”（菜园不改）', () => {
    const dir = join(__dirname, 'locales/fr');
    const bad = readdirSync(dir)
      .filter((f) => f !== 'yard.ts')
      .flatMap((f) =>
        readFileSync(join(dir, f), 'utf8')
          .split('\n')
          // 菜园被偷的好友动态和菜园页的写法一致，不改
          .filter((l) => STUCK.test(l) && !l.includes('a volé votre'))
          .map((l) => `${f}: ${l.trim()}`),
      );
    expect(bad).toEqual([]);
  });

  it('玩家页面的代码不再写死“名字×数量”（后台、菜园、倍率除外）', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
        const p = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!['i18n', 'admin', 'yard'].includes(e.name)) walk(p);
        } else if (/\.(vue|ts)$/.test(e.name) && !e.name.endsWith('.test.ts')) files.push(p);
      }
    };
    walk('');
    const bad = files.flatMap((f) =>
      readFileSync(join(root, f), 'utf8')
        .split('\n')
        // 加成倍率（×1.5）不是数量
        .filter((l) => STUCK.test(l) && !l.includes('factor'))
        .map((l) => `${f}: ${l.trim()}`),
    );
    expect(bad).toEqual([]);
  });
});
