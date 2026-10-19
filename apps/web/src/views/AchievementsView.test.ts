import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AchievementsDto, CatalogAchLineDto, CatalogTrophyDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { achName, lineState, rarityText, trophyName } from '../utils/achieve';
import AchievementsView from './AchievementsView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    achievements: vi.fn(),
    achievementsOf: vi.fn(),
    achievementShelf: vi.fn(),
    catalog: vi.fn(() => new Promise(() => {})),
  },
}));

const roach: CatalogAchLineDto = {
  key: 'roach',
  cat: 'friend',
  name: '灭蟑达人',
  desc: '打蟑螂次数',
  streetId: null,
  labels: null,
  tiers: [
    { id: 'roach.1', tier: 1, n: 100, pts: 10, metric: 'counter:roach.kill', trophy: null, icon: null },
    { id: 'roach.2', tier: 2, n: 1500, pts: 20, metric: 'counter:roach.kill', trophy: 'roach1', icon: null },
    { id: 'roach.3', tier: 3, n: 5000, pts: 40, metric: 'counter:roach.kill', trophy: null, icon: null },
  ],
};
const hunan: CatalogAchLineDto = {
  key: 'cuisine.1',
  cat: 'cookbook',
  name: '菜系',
  desc: '这条街的菜系',
  streetId: 1,
  labels: ['学全', '全部金牌以上', '全部佳肴'],
  tiers: [
    { id: 'cuisine.1.1', tier: 1, n: 1, pts: 15, metric: 'state:cuisine:1', trophy: null, icon: null },
    { id: 'cuisine.1.2', tier: 2, n: 1, pts: 30, metric: 'state:cuisine:5', trophy: null, icon: null },
    { id: 'cuisine.1.3', tier: 3, n: 1, pts: 60, metric: 'state:cuisine:7', trophy: 'cuisine.1', icon: null },
  ],
};
const trophies: CatalogTrophyDto[] = [
  { key: 'roach1', name: '小强青铜', tone: 'bronze', streetId: null },
  { key: 'cuisine.1', name: '宗师', tone: 'gold', streetId: 1 },
];

function setupCatalog() {
  const c = useCatalogStore();
  c.achLines = [roach, hunan];
  c.achById = new Map(
    [roach, hunan].flatMap((line) => line.tiers.map((tier) => [tier.id, { line, tier }] as const)),
  );
  c.trophyMap = new Map(trophies.map((x) => [x.key, x]));
  c.streets = [{ id: 1, name: '湖南街', cookName: '湘菜', desc: '', theme: '', focus: null }] as never;
  c.loaded = true;
  return c;
}

const dto = (patch: Partial<AchievementsDto> = {}): AchievementsDto => ({
  restId: 1,
  name: '我的店',
  mine: true,
  points: 30,
  rank: 3,
  rankRule: { minLevel: 10, minAccountDays: 3 },
  weekPoints: 20,
  got: [
    { id: 'roach.2', at: '2026-10-19T00:12:00.000Z', first: true, backfilled: false },
    { id: 'roach.1', at: '2026-10-18T00:00:00.000Z', first: false, backfilled: true },
  ],
  progress: { 'counter:roach.kill': 1716 },
  shelf: [],
  shelfSlots: 1,
  shelfNext: { points: 3000, slots: 3 },
  rarity: { 'roach.3': 0.004 },
  ...patch,
});

async function mountView(path = '/achievements') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/achievements', component: AchievementsView },
      { path: '/achievements/:restId', component: AchievementsView },
      { path: '/town', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  const w = mount(AchievementsView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('成就工具函数', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('名字：线名 + 罗马数字；菜系线用菜系名；菜系奖杯是菜系名 + 宗师', () => {
    const c = setupCatalog();
    expect(achName('roach.2', c)).toBe('灭蟑达人 II');
    expect(achName('cuisine.1.3', c)).toBe('湘菜 III');
    expect(trophyName('cuisine.1', c)).toBe('湘菜宗师');
  });

  it('线的状态：达成几档、下一档、当前值', () => {
    const s = lineState(roach, new Set(['roach.1']), { 'counter:roach.kill': 700 });
    expect(s).toMatchObject({ got: 1, cur: 700, done: false });
    expect(s.next?.id).toBe('roach.2');
    expect(lineState(roach, new Set(['roach.1', 'roach.2', 'roach.3']), null)).toMatchObject({
      done: true,
      next: null,
    });
  });

  it('稀有度：不到 1% 写 <1%', () => {
    expect(rarityText(0.004)).toBe('<1%');
    expect(rarityText(0.42)).toBe('42%');
    expect(rarityText(undefined)).toBe('0%');
  });
});

describe('AchievementsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    setupCatalog();
  });

  it('总览：成就点、名次、最近达成（首达、补发标签）、分类', async () => {
    vi.mocked(endpoints.achievements).mockResolvedValue(dto());
    const w = await mountView('/achievements?tab=overview');
    expect(w.get('[data-testid="ach-hero"]').text()).toContain('30');
    expect(w.get('[data-testid="ach-hero"]').text()).toContain('第 3 名');
    const recent = w.get('[data-testid="ach-recent"]').text();
    expect(recent).toContain('灭蟑达人 II');
    expect(recent).toContain('全服首达');
    expect(recent).toContain('补发');
    expect(w.get('[data-testid="ach-cat-friend"]').text()).toContain('2 / 3');
  });

  it('分类页：一行一条线，写进度；点开面板列各档和稀有度', async () => {
    vi.mocked(endpoints.achievements).mockResolvedValue(dto());
    const w = await mountView('/achievements?tab=lines&cat=friend');
    const row = w.get('[data-testid="ach-line-roach"]');
    expect(row.text()).toContain('打蟑螂次数 1,716 / 5,000');
    expect(row.text()).toContain('+40');
    await row.trigger('click');
    await flushPromises();
    const tiers = document.body.querySelector('[data-testid="ach-tiers"]')!.textContent!;
    expect(tiers).toContain('奖杯 小强青铜');
    expect(tiers).toContain('本区 <1% 已达成');
  });

  it('一级标签只有三个；总览的分类行进“分类”页那一类，分类页用下拉框换类', async () => {
    vi.mocked(endpoints.achievements).mockResolvedValue(dto());
    const w = await mountView('/achievements?tab=overview');
    expect(w.findAll('[role="tab"]')).toHaveLength(3);
    expect(w.get('[data-testid="ach-cat-friend"]').attributes('href')).toContain('cat=friend');
    const v = await mountView('/achievements?tab=lines&cat=cookbook');
    expect(v.find('[data-testid="ach-line-roach"]').exists()).toBe(false);
    await v.get('[data-testid="ach-cat-select"]').setValue('friend');
    await flushPromises();
    expect(v.find('[data-testid="ach-line-roach"]').exists()).toBe(true);
  });

  it('奖杯：拿到的能摆进展示柜', async () => {
    vi.mocked(endpoints.achievements).mockResolvedValue(dto());
    vi.mocked(endpoints.achievementShelf).mockResolvedValue(dto({ shelf: ['roach1'] }));
    const w = await mountView('/achievements?tab=trophies');
    expect(w.get('[data-testid="ach-case"]').findAll('button')).toHaveLength(2);
    await w.get('[data-testid="ach-trophy-roach1"]').trigger('click');
    await flushPromises();
    (document.body.querySelector('[data-testid="ach-shelf-toggle"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(endpoints.achievementShelf).toHaveBeenCalledWith(['roach1']);
    expect(w.get('[data-testid="ach-shelf"]').text()).toContain('小强青铜');
  });

  it('隐藏成就：没达成的名字、说明都是 ???，不写进度；达成的照常显示，提示写“隐藏成就”', async () => {
    const hidden = (key: string, name: string): CatalogAchLineDto => ({
      key,
      cat: 'hidden',
      name,
      desc: `${name}的条件`,
      streetId: null,
      labels: null,
      hidden: true,
      tiers: [
        { id: `${key}.1`, tier: 1, n: 100, pts: 5, metric: `counter:${key}`, trophy: null, icon: null },
      ],
    });
    const c = useCatalogStore();
    const lines = [hidden('mice', '鼠患'), hidden('penny', '一枚铜板')];
    c.achLines = [...c.achLines, ...lines];
    for (const line of lines) c.achById.set(line.tiers[0]!.id, { line, tier: line.tiers[0]! });
    vi.mocked(endpoints.achievements).mockResolvedValue(
      dto({
        got: [{ id: 'penny.1', at: '2026-10-19T00:12:00.000Z', first: false, backfilled: false }],
        progress: { 'counter:mice': 40 },
      }),
    );
    const w = await mountView('/achievements?tab=lines&cat=hidden');
    const secret = w.get('[data-testid="ach-line-mice"]').text();
    expect(secret).toContain('???');
    expect(secret).toContain('达成后揭晓');
    expect(secret).not.toContain('鼠患');
    expect(secret).not.toContain('40');
    expect(w.get('[data-testid="ach-line-penny"]').text()).toContain('一枚铜板的条件');
    await w.get('[data-testid="ach-line-mice"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="ach-tiers"]')!.textContent).not.toContain('鼠患');
  });

  it('绝版（成就 PR③）：标“绝版”、写“不计点”，分类行不写点数', async () => {
    const veteran: CatalogAchLineDto = {
      key: 'veteran',
      cat: 'legacy',
      name: '开服元老',
      desc: '2026-10-31 以前开的店',
      streetId: null,
      labels: null,
      legacy: true,
      tiers: [
        { id: 'veteran.1', tier: 1, n: 1, pts: 0, metric: 'state:legacy:veteran', trophy: null, icon: null },
      ],
    };
    const c = useCatalogStore();
    c.achLines = [...c.achLines, veteran];
    c.achById.set('veteran.1', { line: veteran, tier: veteran.tiers[0]! });
    vi.mocked(endpoints.achievements).mockResolvedValue(
      dto({ got: [{ id: 'veteran.1', at: '2026-10-19T00:00:00.000Z', first: false, backfilled: true }] }),
    );
    const w = await mountView('/achievements?tab=lines&cat=legacy');
    const row = w.get('[data-testid="ach-line-veteran"]').text();
    expect(row).toContain('绝版');
    expect(row).toContain('不计点');
    const o = await mountView('/achievements?tab=overview');
    const cat = o.get('[data-testid="ach-cat-legacy"]').text();
    expect(cat).toContain('1 / 1');
    expect(cat).not.toContain('点');
  });

  it('里程碑（成就 PR③）：头像框一站一个，写下一个是什么、还差多少', async () => {
    const c = useCatalogStore();
    c.looks = {
      doors: [],
      avatars: [],
      frames: [
        { id: 1, name: '木头像框', tone: 'wood', points: 500 },
        { id: 2, name: '铜头像框', tone: 'bronze', points: 1500 },
        { id: 6, name: '彩头像框', tone: 'rainbow', points: 12000, icon: 'ach-master' },
      ],
      icons: [
        { key: 'ach-master', title: '成就大师', desc: '' },
        { key: 'ach-perfect', title: '小镇完人', desc: '' },
      ],
    };
    vi.mocked(endpoints.achievements).mockResolvedValue(dto({ points: 800 }));
    const w = await mountView('/achievements?tab=overview');
    const m = w.get('[data-testid="ach-milestones"]');
    expect(m.findAll('.dt-ach-stop')).toHaveLength(3);
    expect(m.findAll('.dt-ach-stop.is-got')).toHaveLength(1);
    expect(m.text()).toContain('下一个: 1,500 点 · 铜头像框');
    expect(m.text()).toContain('800 / 1,500');
    expect(m.text()).toContain('成就大师');
    expect(m.text()).toContain('小镇完人');
    vi.mocked(endpoints.achievementsOf).mockResolvedValue(dto({ mine: false, points: 800 }));
    const other = await mountView('/achievements/7');
    expect(other.find('[data-testid="ach-milestones"]').exists()).toBe(false);
  });

  it('别人的成就墙：读那家店的，不显示进度', async () => {
    vi.mocked(endpoints.achievementsOf).mockResolvedValue(dto({ mine: false, progress: {}, name: '乙店' }));
    const w = await mountView('/achievements/7?tab=lines&cat=friend');
    expect(endpoints.achievementsOf).toHaveBeenCalledWith(7);
    expect(w.get('[data-testid="ach-line-roach"]').text()).not.toContain('1,716');
  });
});
