import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useFriendsStore } from './friends';
import { useMailStore } from './mail';

vi.mock('../api/endpoints', () => ({ endpoints: { mailUnread: vi.fn(), friendRequests: vi.fn() } }));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('换号清空之后才回来的红点数丢掉（稳健性批终审：会写回上一个账号的数，邮件还记下 30 秒节流）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('邮件未读数', async () => {
    const d = deferred<{ count: number }>();
    vi.mocked(endpoints.mailUnread).mockReturnValueOnce(d.promise);
    const mail = useMailStore();
    const old = mail.refresh();
    mail.$reset();
    // 换号后马上又要刷新：不能被上一个账号那次请求挡住
    vi.mocked(endpoints.mailUnread).mockResolvedValueOnce({ count: 2 });
    await mail.refresh();
    expect(mail.unread).toBe(2);
    d.resolve({ count: 9 });
    await old;
    expect(mail.unread).toBe(2);
    expect(mail.pending).toBeNull();
  });

  it('只清空、没再刷新：回来的数不写，也不记节流', async () => {
    const d = deferred<{ count: number }>();
    vi.mocked(endpoints.mailUnread).mockReturnValueOnce(d.promise);
    const mail = useMailStore();
    const old = mail.refresh();
    mail.$reset();
    d.resolve({ count: 9 });
    await old;
    expect(mail.unread).toBe(0);
    expect(mail.at).toBe(0);
  });

  it('好友申请数', async () => {
    const d = deferred<unknown[]>();
    vi.mocked(endpoints.friendRequests).mockReturnValueOnce(d.promise as never);
    const friends = useFriendsStore();
    const old = friends.refreshPending();
    friends.$reset();
    d.resolve([1, 2, 3]);
    await old;
    expect(friends.pending).toBe(0);
  });
});
