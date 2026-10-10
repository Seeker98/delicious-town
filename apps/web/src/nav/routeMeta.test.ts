import { describe, expect, it } from 'vitest';
import zhCN from '../i18n/locales/zh-CN';
import { parentPath, routeTitle } from './routeMeta';

const route = (path: string, meta: object, params: Record<string, string> = {}) =>
  ({
    path,
    meta,
    params,
    query: {},
    hash: '',
    fullPath: path,
    name: undefined,
    matched: [],
    redirectedFrom: undefined,
  }) as never;

describe('路由元数据（界面改版 P2a）', () => {
  it('标题按当前语言取', () => {
    expect(routeTitle({ title: (t) => t.bar.title }, zhCN)).toBe('酒吧');
    expect(routeTitle({}, zhCN)).toBeNull();
  });
  it('上一级：写死的地址、按参数算的地址；根页面没有上一级', () => {
    expect(parentPath(route('/bar', { parent: '/map' }))).toBe('/map');
    const byParam = { parent: (to: { params: { restId: string } }) => `/friends/${to.params.restId}` };
    expect(parentPath(route('/friends/9/flip', byParam, { restId: '9' }))).toBe('/friends/9');
    expect(parentPath(route('/cookbooks', { section: 'cookbooks' }))).toBeNull();
  });
});
