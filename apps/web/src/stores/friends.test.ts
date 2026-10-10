import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { useFriendsStore } from './friends';

vi.mock('../api/endpoints', () => ({ endpoints: { friendRequests: vi.fn() } }));

/** 一个可以手动决定什么时候回来的请求 */
function later<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return { p, resolve };
}

describe('好友申请数（导航红点）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('连着请求两次、回来的顺序反了：留下后发的那次（backlog 1010）', async () => {
    const first = later<never[]>();
    const second = later<never[]>();
    vi.mocked(endpoints.friendRequests)
      .mockReturnValueOnce(first.p as never)
      .mockReturnValueOnce(second.p as never);
    const s = useFriendsStore();
    const a = s.refreshPending();
    const b = s.refreshPending();
    second.resolve([{}, {}] as never);
    await b;
    first.resolve([{}, {}, {}, {}, {}] as never);
    await a;
    expect(s.pending).toBe(2);
  });

  it('页面直接写了最新的数以后，之前发出的请求回来也不覆盖（backlog 1010）', async () => {
    const old = later<never[]>();
    vi.mocked(endpoints.friendRequests).mockReturnValueOnce(old.p as never);
    const s = useFriendsStore();
    const a = s.refreshPending();
    s.setPending(1);
    old.resolve([{}, {}, {}] as never);
    await a;
    expect(s.pending).toBe(1);
  });
});
