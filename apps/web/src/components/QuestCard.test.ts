import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestDto } from '@dt/shared';
import QuestCard from './QuestCard.vue';

const quest = (patch: Partial<QuestDto>): QuestDto => ({
  id: 4025,
  name: '领取本周探险图',
  href: '/temple',
  key: 'temple.explore',
  target: 5,
  progress: 3,
  done: false,
  claimed: false,
  award: {},
  ...patch,
});
const card = (q: QuestDto, extra: { award?: string; busy?: boolean; locked?: string | null } = {}) =>
  mount(QuestCard, { props: { quest: q, name: q.name, award: '', busy: false, ...extra } });

describe('任务卡片', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('普通任务显示进度', () => {
    const w = card(quest({}));
    expect(w.get('.dt-act-count').text()).toBe('3/5');
    expect(w.find('[data-testid="claim-task-4025"]').exists()).toBe(false);
  });

  it('目标为 0 的（每周“领取本周探险图”）不显示 0/0，直接给领取按钮（问题记录 515 终审）', () => {
    const w = card(quest({ target: 0, progress: 0, done: true }));
    expect(w.text()).not.toContain('0/0');
    expect(w.get('[data-testid="claim-task-4025"]').text()).toBe('领奖');
    // 没完成时也不写 0/0
    const open = card(quest({ target: 0, progress: 0 }));
    expect(open.text()).not.toContain('0/0');
    expect(open.find('.dt-act-count').exists()).toBe(false);
  });

  it('是卡片里的一行（界面改版 P3：原来一个任务一张卡片；P7：和别处一样的行，不再有细进度条）；可领的有 is-ready、已领的 is-claimed', () => {
    const row = card(quest({}), { award: '金币 2,000' });
    expect(row.classes()).toEqual(expect.arrayContaining(['dt-row', 'dt-quest']));
    expect(row.classes()).not.toContain('dt-item');
    expect(row.classes()).not.toContain('border');
    expect(row.find('.dt-quest-bar').exists()).toBe(false);
    expect(row.get('.dt-row-title').text()).toBe('领取本周探险图');
    // 奖励灰字一行，不再写“奖励: ”
    expect(row.get('.dt-row-sub').text()).toBe('金币 2,000');
    expect(card(quest({ progress: 5, done: true })).classes()).toContain('is-ready');
    expect(card(quest({ progress: 5, done: true, claimed: true })).classes()).toContain('is-claimed');
  });

  it('完成了给领奖按钮，点了发 claim；忙的时候按钮禁用', async () => {
    const w = card(quest({ progress: 5, done: true }));
    await w.get('[data-testid="claim-task-4025"]').trigger('click');
    expect(w.emitted('claim')).toHaveLength(1);
    const busy = card(quest({ progress: 5, done: true }), { busy: true });
    expect(busy.get('[data-testid="claim-task-4025"]').attributes('disabled')).toBeDefined();
  });

  it('已领写“已领”小标签，不放按钮', () => {
    const w = card(quest({ progress: 5, done: true, claimed: true }));
    expect(w.get('.dt-tag.dt-tag-ok').text()).toBe('已领');
    expect(w.find('[data-testid="claim-task-4025"]').exists()).toBe(false);
    expect(w.find('.dt-act-count').exists()).toBe(false);
  });

  it('锁定时写原因（去掉锁符号，另画锁图标），即使完成了也不放领奖按钮', () => {
    const w = card(quest({ progress: 5, done: true }), { locked: '🔒 2 星解锁' });
    const tag = w.get('.dt-tag.dt-tag-mute');
    expect(tag.text()).toBe('2 星解锁');
    expect(tag.find('.bi-lock-fill').exists()).toBe(true);
    expect(w.text()).not.toContain('🔒');
    expect(w.find('[data-testid="claim-task-4025"]').exists()).toBe(false);
  });
});
