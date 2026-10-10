import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { RouteFlags } from '../guard';
import type { Messages } from '../i18n';
import type { Section } from './sections';

/** 路由元数据（界面改版设计 §4.2）：所属入口、标题、逻辑上一级 */
export interface NavMeta {
  section?: Section;
  title?: (t: Messages) => string;
  parent?: string | ((to: RouteLocationNormalizedLoaded) => string);
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
export function parentPath(route: RouteLocationNormalizedLoaded): string | null {
  const p = route.meta.parent;
  if (!p) return null;
  return typeof p === 'function' ? p(route) : p;
}
