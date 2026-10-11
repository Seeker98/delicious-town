import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmStore } from './confirm';

describe('确认（界面改版 P3：取代浏览器确认框）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('没挂确认面板（单独挂页面的测试）：退回浏览器确认框，标题和正文分两行', async () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(useConfirmStore().ask({ title: '分解？', body: '得到 3 个' })).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith('分解？\n得到 3 个');
    spy.mockReturnValue(false);
    await expect(useConfirmStore().ask({ title: '只有标题' })).resolves.toBe(false);
    expect(spy).toHaveBeenLastCalledWith('只有标题');
  });

  it('挂了确认面板：不调浏览器确认框，当前请求给面板显示；点了哪个就得哪个', async () => {
    const spy = vi.spyOn(window, 'confirm');
    const s = useConfirmStore();
    s.hosts = 1;
    const p = s.ask({ title: '分解？', danger: true, ok: '分解' });
    expect(spy).not.toHaveBeenCalled();
    expect(s.current).toMatchObject({ title: '分解？', danger: true, ok: '分解' });
    s.answer(true);
    await expect(p).resolves.toBe(true);
    expect(s.current).toBeNull();
  });

  it('前一个还开着又要确认另一个：前一个按取消结束，只显示新的（Review Focus 1）', async () => {
    const s = useConfirmStore();
    s.hosts = 1;
    const a = s.ask({ title: '甲' });
    const b = s.ask({ title: '乙' });
    await expect(a).resolves.toBe(false);
    expect(s.current?.title).toBe('乙');
    s.answer(false);
    await expect(b).resolves.toBe(false);
  });
});
