import type { UiArtName } from '../art/generated/names';

/** 底部导航的 6 个入口（界面改版设计 §4.1）：每个页面属于其中一个，顶栏和底部导航据此显示 */
export type Section = 'home' | 'cookbooks' | 'cupboard' | 'market' | 'friends' | 'map';
export interface SectionDef {
  key: Section;
  to: string;
  art: UiArtName;
  /** 所属的区服功能；关掉时不显示（问题记录 248） */
  feature?: string;
}
export const SECTIONS: readonly SectionDef[] = [
  { key: 'home', to: '/', art: 'nav-home' },
  { key: 'cookbooks', to: '/cookbooks', art: 'nav-cookbooks', feature: 'cookbook' },
  { key: 'cupboard', to: '/cupboard', art: 'nav-cupboard', feature: 'cupboard' },
  { key: 'market', to: '/market', art: 'nav-market', feature: 'market' },
  { key: 'friends', to: '/friends', art: 'nav-friends', feature: 'friend' },
  { key: 'map', to: '/map', art: 'nav-map' },
];
export const ROOT_PATHS: ReadonlySet<string> = new Set(SECTIONS.map((s) => s.to));
