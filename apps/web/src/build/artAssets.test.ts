import { describe, expect, it } from 'vitest';
import { inlineLimit } from './artAssets';

describe('图形雪碧图不内联（界面改版 P1）', () => {
  it('雪碧图永远单独成文件：<use> 不能引用 data: 地址', () => {
    expect(inlineLimit('/x/apps/web/src/art/generated/ui.svg')).toBe(false);
    const win = ['C:', 'x', 'apps', 'web', 'src', 'art', 'generated', 'content.svg'].join(
      String.fromCharCode(92),
    );
    expect(inlineLimit(win)).toBe(false);
  });

  it('头图也单独成文件（界面改版 P3，设计 §3.4：懒加载、走缓存）', () => {
    expect(inlineLimit('/x/apps/web/src/art/scene/restaurant.svg')).toBe(false);
  });

  it('其他资源按 Vite 默认处理', () => {
    expect(inlineLimit('/x/apps/web/src/styles/bootstrap-icons-subset.woff2')).toBeUndefined();
  });
});
