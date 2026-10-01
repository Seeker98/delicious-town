import { describe, expect, it } from 'vitest';
import { routes } from './router';

describe('routes', () => {
  it('旧的教室地址跳到广场的教室标签（问题记录 122）', () => {
    expect(routes.find((r) => r.path === '/classroom')?.redirect).toEqual({
      path: '/town',
      query: { tab: 'classroom' },
    });
  });
});
