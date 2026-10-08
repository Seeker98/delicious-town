import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useFriendsStore } from './friends';
import { useLocaleStore } from './locale';
import { useMailStore } from './mail';
import { useRestaurantStore } from './restaurant';
import { useSessionStore } from './session';

vi.mock('../api/endpoints', () => ({
  endpoints: { me: vi.fn(), logout: vi.fn(), setLang: vi.fn(), selectShard: vi.fn() },
}));

const me = (patch: Partial<MeDto> = {}): MeDto => ({
  accountId: 1,
  username: 'u',
  email: 'u@x',
  emailVerified: true,
  role: 'player',
  shardId: 1,
  restaurantId: 10,
  lang: 'zh-CN',
  npcRestId: null,
  ...patch,
});
/** 记着一家店和它的下一星要求 */
function cached(id: number) {
  const r = useRestaurantStore();
  r.rest = { id, streetId: 3, starLevel: 2 } as never;
  r.starNeed = { key: `${id}:2`, value: { star: 3, need: 100 } };
  return r;
}

describe('换号、换区服时清掉记着的餐厅（性能排查终审遗留：不然食谱页的搬街提示可能用上一家店的数字）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useLocaleStore().locale = 'zh-CN';
  });

  it('退出登录：清掉', async () => {
    const r = cached(10);
    await useSessionStore().logout();
    expect(r.rest).toBeNull();
    expect(r.starNeed).toBeNull();
  });

  it('读到的账号是另一家店：清掉；还是同一家店：留着', async () => {
    const r = cached(10);
    await useSessionStore().applyMe(me({ restaurantId: 10 }));
    expect(r.rest?.id).toBe(10);
    await useSessionStore().applyMe(me({ accountId: 2, restaurantId: 20 }));
    expect(r.rest).toBeNull();
    expect(r.starNeed).toBeNull();
  });

  it('选区服：进入另一个区服的店，清掉，账号里的区服和店跟着改', async () => {
    const r = cached(10);
    const s = useSessionStore();
    s.me = me();
    vi.mocked(endpoints.selectShard).mockResolvedValue({
      shardId: 2,
      restaurantId: 20,
      npcRestId: null,
    } as never);
    const res = await s.enterShard(2);
    expect(endpoints.selectShard).toHaveBeenCalledWith(2);
    expect(res.restaurantId).toBe(20);
    expect(s.me).toMatchObject({ shardId: 2, restaurantId: 20 });
    expect(r.rest).toBeNull();
  });
});

describe('换号、换区服时邮件未读数和好友申请红点也清掉（稳健性批：原来新账号最多看到 30 秒旧的数）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useLocaleStore().locale = 'zh-CN';
  });
  const dirty = () => {
    const mail = useMailStore();
    mail.unread = 5;
    mail.at = Date.now();
    useFriendsStore().pending = 2;
    return mail;
  };

  it('退出登录：清掉', async () => {
    const mail = dirty();
    await useSessionStore().logout();
    expect(mail.unread).toBe(0);
    expect(mail.at).toBe(0);
    expect(useFriendsStore().pending).toBe(0);
  });

  it('换了一家店（换账号、进别的区服）：清掉；还是同一家店：留着', async () => {
    const s = useSessionStore();
    await s.applyMe(me({ restaurantId: 10 }));
    const mail = dirty();
    await s.applyMe(me({ restaurantId: 10 }));
    expect(mail.unread).toBe(5);
    vi.mocked(endpoints.selectShard).mockResolvedValue({
      shardId: 2,
      restaurantId: 20,
      npcRestId: null,
    } as never);
    await s.enterShard(2);
    expect(mail.unread).toBe(0);
    expect(useFriendsStore().pending).toBe(0);
  });
});
