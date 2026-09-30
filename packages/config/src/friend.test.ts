import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('好友互动的配置', () => {
  it('装扮列表和 friend 数值能加载', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.looks.doors[0]).toEqual({ id: 0, name: '木门', coin: 0 });
    expect(bundle!.looks.avatars.length).toBeGreaterThanOrEqual(12);
    expect(bundle!.looks.icons.map((i) => i.key)).toContain('founder');
    expect(bundle!.tuning.friend.maxFriends).toBe(199);
    expect(bundle!.tuning.friend.npc.name).toBe('蟹老板');
  });

  it('摇钱袋归小镇玩法，蟑螂和好友归 friend', () => {
    const c = createGameConfig(buildBundle(source()).bundle!);
    expect(c.featureOfKey('krab.shake')).toBe('town');
    expect(c.featureOfKey('roach.kill')).toBe('friend');
    expect(c.featureOfKey('friends.count')).toBe('friend');
  });

  it('门 id 重复、0 号门收费、蟹老板的头像不存在时报错', () => {
    const src = source();
    const looks = structuredClone(src['game/looks']) as {
      doors: Array<{ id: number; name: string; coin: number }>;
    };
    looks.doors.push({ id: 1, name: '重复', coin: 1 });
    looks.doors[0]!.coin = 5;
    const tuning = structuredClone(src['game/tuning']) as { friend: { npc: { avatar: number } } };
    tuning.friend.npc.avatar = 999;
    const { errors } = buildBundle({ ...src, 'game/looks': looks, 'game/tuning': tuning });
    expect(errors).toContain('looks: duplicate door 1');
    expect(errors).toContain('looks: door 0 must be free');
    expect(errors).toContain('tuning.friend.npc.avatar 999 not in looks');
  });
});
