import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ArtName } from '../art/generated/names';
import { useSessionStore } from '../stores/session';
import { restAva } from './restAva';

/** 头像编号 → 图：只认 2 号 */
const avatarArt = (id: number | null | undefined): ArtName | null =>
  id === 2 ? ('avatar-chef' as ArtName) : null;

describe('店的头像图 restAva（界面改版 P10）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().me = { npcRestId: 1 } as never;
  });

  it('蟹老板的店画蟹老板，不管它选了什么头像', () => {
    expect(restAva(1, 2, avatarArt)).toBe('npc-krab');
    expect(restAva(1, null, avatarArt)).toBe('npc-krab');
  });

  it('别的店画它选的头像；没选或网页里没有这张图时画厨师', () => {
    const art = (id: number | null | undefined): ArtName | null =>
      id === 5 ? ('npc-mayor' as ArtName) : null;
    expect(restAva(7, 5, art)).toBe('npc-mayor');
    expect(restAva(7, null, art)).toBe('avatar-chef');
    expect(restAva(7, 99, art)).toBe('avatar-chef');
    expect(restAva(null, undefined, art)).toBe('avatar-chef');
  });

  it('还不知道蟹老板店的编号时不当成蟹老板', () => {
    useSessionStore().me = null;
    expect(restAva(1, null, avatarArt)).toBe('avatar-chef');
  });
});
