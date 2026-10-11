import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { RouteFlags } from '../guard';
import type { Messages } from '../i18n';
import type { Section } from './sections';

/** 路由元数据（界面改版设计 §4.2）：所属入口、标题、逻辑上一级 */
export interface NavMeta {
  section?: Section;
  title?: (t: Messages) => string;
  /** 上一级：写死的地址，或按当前地址和浏览器历史里的上一页（back）算 */
  parent?: string | ((to: RouteLocationNormalizedLoaded, back: unknown) => string);
}
declare module 'vue-router' {
  interface RouteMeta extends NavMeta, RouteFlags {
    admin?: boolean;
  }
}

export function routeTitle(meta: NavMeta, t: Messages): string | null {
  return meta.title ? meta.title(t) : null;
}

/** 顶栏返回去哪：根页面（底部 6 个入口）没有上一级，返回 null */
export function parentPath(route: RouteLocationNormalizedLoaded, back: unknown = null): string | null {
  const p = route.meta.parent;
  if (!p) return null;
  return typeof p === 'function' ? p(route, back) : p;
}

/** 详情页回列表：上一页就是这个列表（带搜索、筛选）时回原样，否则回列表首页（backlog 第 ⑧ 批） */
export function listBack(list: string, back: unknown): string {
  return typeof back === 'string' && (back === list || back.startsWith(`${list}?`)) ? back : list;
}
