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
const card = (q: QuestDto) => mount(QuestCard, { props: { quest: q, name: q.name, award: '', busy: false } });

describe('任务卡片', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('普通任务显示进度', () => {
    expect(card(quest({})).text()).toContain('3/5');
  });

  it('目标为 0 的（每周“领取本周探险图”）不显示 0/0，直接给领取按钮（问题记录 515 终审）', () => {
    const w = card(quest({ target: 0, progress: 0, done: true }));
    expect(w.text()).not.toContain('0/0');
    expect(w.find('[data-testid="claim-task-4025"]').exists()).toBe(true);
  });
});
