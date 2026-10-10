import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTitleDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import TitlePicker from './TitlePicker.vue';
import { resetTitleList } from './titleList';

vi.mock('../../api/admin', () => ({ adminApi: { titles: vi.fn(), createTitle: vi.fn() } }));

const row = (p: Partial<AdminTitleDto> & { key: string; title: string }): AdminTitleDto => ({
  id: null,
  desc: null,
  note: null,
  source: 'general',
  retired: false,
  owners: 0,
  createdBy: null,
  createdAt: null,
  ...p,
});
const LIST = [
  row({ key: 'c2', id: 2, title: '面霸', source: 'custom', note: '给群主' }),
  row({ key: 'c1', id: 1, title: '停用的', source: 'custom', retired: true }),
  row({ key: 'founder', title: '开服元老' }),
];
const P = '[data-testid="tp-';
const sel = (n: string) => `${P}${n}"]`;

async function mountPicker(props: Record<string, unknown> = {}) {
  const w = mount(TitlePicker, { props: { modelValue: { key: '', title: '' }, testid: 'tp', ...props } });
  await flushPromises();
  return w;
}
const last = (w: Awaited<ReturnType<typeof mountPicker>>) =>
  w.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>;

describe('TitlePicker（定制称号设计 三）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTitleList();
    vi.mocked(adminApi.titles).mockResolvedValue(LIST);
  });

  it('定制的、配置的分组列出，停用的不出现；搜索按名字和备注', async () => {
    const w = await mountPicker();
    const opts = w.findAll(`${sel('select')} option`).map((o) => o.text());
    expect(opts.join('|')).toContain('面霸');
    expect(opts.join('|')).toContain('开服元老');
    expect(opts.join('|')).not.toContain('停用的');
    await w.find(sel('q')).setValue('群主');
    const after = w.findAll(`${sel('select')} option`).map((o) => o.text());
    expect(after.join('|')).toContain('面霸');
    expect(after.join('|')).not.toContain('开服元老');
  });

  it('选称号、三种有效期', async () => {
    const w = await mountPicker();
    await w.find(sel('select')).setValue('c2');
    expect(last(w)).toEqual({ key: 'c2', title: '面霸' });
    await w.find(sel('mode')).setValue('days');
    await w.find(sel('days')).setValue(7);
    expect(last(w)).toEqual({ key: 'c2', title: '面霸', days: 7 });
    await w.find(sel('mode')).setValue('until');
    await w.find(sel('until')).setValue('2026-10-31T23:59');
    expect(last(w)).toEqual({ key: 'c2', title: '面霸', until: '2026-10-31T15:59:00.000Z' });
  });

  it('改回“选择称号”时外层也清掉（backlog 1010）', async () => {
    const w = await mountPicker();
    await w.find(sel('select')).setValue('founder');
    expect(last(w)).toMatchObject({ key: 'founder' });
    await w.find(sel('select')).setValue('');
    expect(last(w)).toEqual({ key: '', title: '' });
  });

  it('搜索把选中的那个滤掉时它还留在下拉里，不显示空白（backlog 1010）', async () => {
    const w = await mountPicker();
    await w.find(sel('select')).setValue('founder');
    await w.find(sel('q')).setValue('群主');
    const opts = w.findAll(`${sel('select')} option`).map((o) => o.attributes('value'));
    expect(opts).toContain('founder');
    expect(opts).toContain('c2');
    expect((w.find(sel('select')).element as HTMLSelectElement).value).toBe('founder');
  });

  it('不开新建时没有新建按钮', async () => {
    const w = await mountPicker();
    expect(w.find(sel('new')).exists()).toBe(false);
  });

  it('新建：字数按看上去的字算；重名提示但能保存；保存后选中', async () => {
    vi.mocked(adminApi.createTitle).mockResolvedValue(
      row({ key: 'c9', id: 9, title: '面霸', source: 'custom' }),
    );
    const w = await mountPicker({ create: true });
    await w.find(sel('new')).trigger('click');
    await w.find(sel('new-title')).setValue('👨‍🍳主厨');
    expect(w.find(sel('new-count')).text()).toContain('3/10');
    expect(w.find(sel('dup')).exists()).toBe(false);
    await w.find(sel('new-title')).setValue('面霸');
    expect(w.find(sel('dup')).exists()).toBe(true);
    await w.find(sel('new-desc')).setValue('第二个面霸');
    await w.find(sel('new-save')).trigger('click');
    await flushPromises();
    expect(adminApi.createTitle).toHaveBeenCalledWith({ title: '面霸', desc: '第二个面霸', note: '' });
    expect(last(w)).toEqual({ key: 'c9', title: '面霸' });
    expect((w.find(sel('select')).element as HTMLSelectElement).value).toBe('c9');
  });
});
