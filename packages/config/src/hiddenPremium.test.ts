import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultDataDir } from './source';

/**
 * 高级菜场暂时隐藏（问题记录 477）：道具说明里不能再写“可在高级菜场购菜”（backlog：爱心项链）。
 * 恢复高级菜场时把说明加回来、删掉这个测试
 */
const PATTERNS = [/高级菜场/, /premium market/i, /mercado premium/i, /marché de luxe/i];

describe('高级菜场隐藏期间，道具说明不提它', () => {
  it('简中、英、西、法的道具说明', () => {
    const dir = defaultDataDir();
    const texts: Array<[string, string]> = [
      ['master/goods.json', readFileSync(join(dir, 'master/goods.json'), 'utf8')],
    ];
    for (const l of ['en', 'es', 'fr']) {
      const p = `i18n/${l}/goods.json`;
      texts.push([p, readFileSync(join(dir, p), 'utf8')]);
    }
    const bad = texts.flatMap(([p, s]) =>
      s
        .split('\n')
        .filter((line) => PATTERNS.some((re) => re.test(line)))
        .map((line) => `${p}: ${line.trim().slice(0, 80)}`),
    );
    expect(bad).toEqual([]);
  });
});
