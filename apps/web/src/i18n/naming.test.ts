import { describe, expect, it } from 'vitest';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import zhCN from './locales/zh-CN';

/** 同一样东西各处叫法一致（界面改版 P2b：统一命名） */
describe('统一命名（界面改版 P2b）', () => {
  it('简中', () => {
    expect(zhCN.home.oilUpgrade).toBe('油壶扩容');
    expect(zhCN.account.shards.title).toBe('切换区服');
    expect(zhCN.friends.exchange.title).toBe('换食材');
    expect(zhCN.wiki.kinds.cookbooks).toBe('食谱');
    expect(zhCN.wiki.intro).not.toContain('菜谱');
    expect(zhCN.guide.wikiHint).not.toContain('菜谱');
    expect(zhCN.nav.news.more).toBe('全部');
    expect(zhCN.friends.tabs.friends).toBe('我的好友');
    expect(zhCN.cupboard.tabs.cupboard).toBe('常温');
    expect(zhCN.store.tabs.items).toBe('道具');
    expect(zhCN.tower.tabs.tower).toBe('挑战');
    expect(zhCN.store.shop.tabs.special).toBe('限时折扣');
    expect(zhCN.wiki.sources.special).toContain('限时折扣');
    expect(zhCN.activity.title).toBe('活动');
    expect(zhCN.nav.links.activities).toBe('活动');
    expect(zhCN.nav.map.places.activities.name).toBe('活动');
  });

  it('英法西文：和别处冲突的几条', () => {
    expect(en.home.oilUpgrade).toBe(en.society.links.oil.label);
    expect([en.account.shards.title, fr.account.shards.title, es.account.shards.title]).toEqual([
      'Switch server',
      'Changer de serveur',
      'Cambiar de servidor',
    ]);
    expect([en.nav.news.more, fr.nav.news.more, es.nav.news.more]).toEqual(['All', 'Tout', 'Todo']);
    expect([en.friends.tabs.friends, fr.friends.tabs.friends, es.friends.tabs.friends]).toEqual([
      'My friends',
      'Mes amis',
      'Mis amigos',
    ]);
    expect([en.cupboard.tabs.cupboard, fr.cupboard.tabs.cupboard, es.cupboard.tabs.cupboard]).toEqual([
      'Shelf',
      'Étagère',
      'Estante',
    ]);
    expect([en.store.tabs.items, fr.store.tabs.items, es.store.tabs.items]).toEqual([
      'Items',
      'Objets',
      'Objetos',
    ]);
    expect([en.tower.tabs.tower, fr.tower.tabs.tower, es.tower.tabs.tower]).toEqual([
      'Climb',
      'Ascension',
      'Ascenso',
    ]);
    expect([en.store.shop.tabs.special, fr.store.shop.tabs.special, es.store.shop.tabs.special]).toEqual([
      'Limited-time deals',
      'Promos limitées',
      'Ofertas limitadas',
    ]);
  });
});
