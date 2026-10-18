<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { AchievementsDto, CatalogAchLineDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AchTrophy from '../components/achieve/AchTrophy.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { usePageTitle } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';
import {
  ACH_CATS,
  ACH_TABS,
  achName,
  achWhen,
  catStats,
  lineName,
  lineState,
  rarityText,
  tierText,
  tierValue,
  trophyName,
  trophySource,
  type AchCatKey,
  type AchTab,
} from '../utils/achieve';
import { formatNum } from '../utils/format';

/**
 * 成就墙（成就系统 2026-10-19，样稿 ①~④）：总览（成就点主角卡、最近达成、分类）、奖杯（展示柜 + 4 列格子）、
 * 十个分类各一页（一条成就线一行，点开从下面弹出各档）。/achievements/:restId 是别人的，只读、不带进度
 */
const t = useT();
const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const otherId = computed(() => (route.params.restId ? Number(route.params.restId) : null));
const data = ref<AchievementsDto | null>(null);
const failed = ref(false);
const busy = ref(false);

usePageTitle(() => (data.value && !data.value.mine ? t.value.achieve.wallOf(data.value.name) : null));

async function load() {
  data.value =
    otherId.value === null ? await endpoints.achievements() : await endpoints.achievementsOf(otherId.value);
}
onMounted(() => {
  void catalog.load().catch(() => undefined);
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.achieve.loadFailed), 'danger');
  });
});
watch(otherId, () => void load().catch(() => undefined));

const tab = useTabQuery<AchTab>({ tabs: ACH_TABS, storageKey: 'dt_ach_tab' });
/** 分类页看哪一类（网址 ?cat=，记住上次看的） */
const cat = useTabQuery<AchCatKey>({ tabs: ACH_CATS, param: 'cat', storageKey: 'dt_ach_cat' });
const tabItems = computed(() => ACH_TABS.map((k) => ({ key: k, label: t.value.achieve.tabs[k] })));

const gotMap = computed(() => new Map((data.value?.got ?? []).map((g) => [g.id, g])));
const gotSet = computed(() => new Set(gotMap.value.keys()));
const progress = computed(() => (data.value?.mine ? data.value.progress : null));
const allTiers = computed(() => catalog.achLines.flatMap((l) => l.tiers));
const totalPts = computed(() => allTiers.value.reduce((a, x) => a + x.pts, 0));
const trophyKeys = computed(() => [...catalog.trophyMap.keys()]);
/** 奖杯格子：拿到的排前面，其余按配置顺序 */
const trophyOrder = computed(() => [
  ...trophyKeys.value.filter((k) => myTrophies.value.has(k)),
  ...trophyKeys.value.filter((k) => !myTrophies.value.has(k)),
]);
const myTrophies = computed(
  () => new Set(allTiers.value.filter((x) => x.trophy && gotSet.value.has(x.id)).map((x) => x.trophy!)),
);
const recent = computed(() => (data.value?.got ?? []).slice(0, 5));
const cats = computed(() =>
  ACH_CATS.map((c) => {
    const s = catStats(c, catalog, gotSet.value);
    return { key: c, ...s, pct: s.total > 0 ? (s.got / s.total) * 100 : 0 };
  }),
);

/** 分类页：全部 / 进行中 / 已满档 */
const filter = ref<'all' | 'doing' | 'done'>('all');
const lines = computed(() =>
  catalog.achLines
    .filter((l) => l.cat === cat.value)
    .map((l) => lineState(l, gotSet.value, progress.value))
    .filter((s) => filter.value === 'all' || (filter.value === 'done') === s.done),
);
/** 档位条：达成的实心、带奖杯的档金色（没拿到只有金边） */
const segs = (l: CatalogAchLineDto) =>
  l.tiers.map((x) => ({ on: gotSet.value.has(x.id), cup: x.trophy !== null, id: x.id }));

/** 成就线面板 */
const openLine = ref<CatalogAchLineDto | null>(null);
const openState = computed(() =>
  openLine.value ? lineState(openLine.value, gotSet.value, progress.value) : null,
);
/** 行首的奖杯：拿到的最高一档奖杯的颜色；还没拿到奖杯时是第一个奖杯的剪影；这条线没有奖杯时 null */
const lineTrophy = (l: CatalogAchLineDto) => {
  const cups = l.tiers.filter((x) => x.trophy);
  if (cups.length === 0) return null;
  const got = [...cups].reverse().find((x) => gotSet.value.has(x.id));
  const x = got ?? cups[0]!;
  return { tone: catalog.trophyMap.get(x.trophy!)?.tone ?? 'gold', locked: !got };
};
const meterPct = (cur: number | null, n: number) => `${Math.min(100, ((cur ?? 0) / Math.max(1, n)) * 100)}%`;

/** 奖杯面板、展示柜 */
const openTrophy = ref<string | null>(null);
const shelf = computed(() => data.value?.shelf ?? []);
async function toggleShelf(key: string) {
  if (!data.value) return;
  const next = shelf.value.includes(key) ? shelf.value.filter((k) => k !== key) : [...shelf.value, key];
  if (next.length > data.value.shelfSlots) {
    toast.push(t.value.achieve.shelfFull, 'info');
    return;
  }
  busy.value = true;
  try {
    data.value = await endpoints.achievementShelf(next);
    toast.push(t.value.achieve.shelfSaved, 'success');
    openTrophy.value = null;
  } catch (e) {
    toast.push(errorMessage(e, t.value.achieve.shelfFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
const trophyTone = (key: string) => catalog.trophyMap.get(key)?.tone ?? 'bronze';
const trophyAt = (key: string) => {
  const src = trophySource(key, catalog);
  const g = src ? gotMap.value.get(src.tier.id) : undefined;
  return g ? achWhen(g.at) : null;
};
const iconTitle = (key: string | null) => (key ? (catalog.icon(key)?.title ?? key) : '');
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" testid-prefix="ach-tab-" />
  <DtSkeleton v-if="!data && !failed" :rows="6" />
  <DtEmpty v-else-if="!data" :title="t.achieve.loadFailed" />
  <template v-else>
    <!-- ① 总览 -->
    <template v-if="tab === 'overview'">
      <section class="dt-card dt-ach-hero" data-testid="ach-hero">
        <div>
          <div class="dt-meta">{{ t.achieve.points }}</div>
          <div class="dt-ach-pts">
            {{ formatNum(data.points) }}<small>{{ t.achieve.ofTotal(formatNum(totalPts)) }}</small>
          </div>
        </div>
        <div class="dt-ach-rank">
          <span class="dt-meta">{{ t.achieve.rank }}</span>
          <b>{{ data.rank ? t.achieve.rankN(data.rank) : t.achieve.unranked }}</b>
          <span v-if="!data.rank && data.mine" class="dt-meta dt-ach-rank-hint">{{
            t.achieve.unrankedHint(data.rankRule.minLevel, data.rankRule.minAccountDays)
          }}</span>
          <RouterLink class="dt-go" to="/town?tab=rank&board=achieve.points">{{
            t.achieve.rankLink
          }}</RouterLink>
        </div>
        <div class="dt-ach-stats">
          <div>
            <b>{{ data.got.length }}</b
            ><span>{{ t.achieve.statGot(allTiers.length) }}</span>
          </div>
          <div>
            <b>{{ myTrophies.size }}</b
            ><span>{{ t.achieve.statTrophies(trophyKeys.length) }}</span>
          </div>
          <div>
            <b>+{{ formatNum(data.weekPoints) }}</b
            ><span>{{ t.achieve.statWeek }}</span>
          </div>
        </div>
        <div v-if="data.mine && data.shelfNext" class="dt-ach-next">
          <div class="dt-meta">
            <span>{{ t.achieve.shelfOpen(formatNum(data.shelfNext.points), data.shelfNext.slots) }}</span>
            <span>{{ formatNum(data.points) }} / {{ formatNum(data.shelfNext.points) }}</span>
          </div>
          <div class="dt-meter"><i :style="{ width: meterPct(data.points, data.shelfNext.points) }" /></div>
        </div>
      </section>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.achieve.recent }}</h2>
        </div>
        <div v-if="recent.length === 0" class="dt-card dt-empty">{{ t.achieve.recentEmpty }}</div>
        <div v-else class="dt-card dt-rows-card" data-testid="ach-recent">
          <div v-for="g in recent" :key="g.id" class="dt-row">
            <AchTrophy
              v-if="catalog.achById.get(g.id)?.tier.trophy"
              :tone="trophyTone(catalog.achById.get(g.id)!.tier.trophy!)"
              :size="30"
            />
            <span v-else class="dt-ach-ico" aria-hidden="true">★</span>
            <div class="dt-row-main">
              <span class="dt-row-title">{{ achName(g.id, catalog) }}</span>
              <span class="dt-meta">
                {{ achWhen(g.at) }}
                <span v-if="g.first" class="dt-tag dt-tag-warn">{{ t.achieve.first }}</span>
                <span v-if="g.backfilled" class="dt-tag dt-tag-mute">{{ t.achieve.backfilled }}</span>
              </span>
            </div>
            <span class="dt-ach-side"
              ><b>+{{ catalog.achById.get(g.id)?.tier.pts ?? 0 }}</b></span
            >
          </div>
        </div>
      </section>

      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.achieve.categories }}</h2>
        </div>
        <div class="dt-card dt-rows-card" data-testid="ach-cats">
          <RouterLink
            v-for="c in cats"
            :key="c.key"
            :to="{ query: { tab: 'lines', cat: c.key } }"
            class="dt-row is-link"
            :data-testid="`ach-cat-${c.key}`"
          >
            <div class="dt-row-main">
              <span class="dt-row-title">{{ t.achieve.tabs[c.key] }}</span>
              <div class="dt-meter"><i :style="{ width: `${c.pct}%` }" /></div>
            </div>
            <span class="dt-ach-side"
              ><b>{{ c.got }} / {{ c.total }}</b
              >{{ t.achieve.catSide(c.pts) }}</span
            >
          </RouterLink>
        </div>
      </section>
    </template>

    <!-- ④ 奖杯 -->
    <template v-else-if="tab === 'trophies'">
      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.achieve.shelf }}</h2>
          <span v-if="data.shelfNext" class="dt-meta">{{
            t.achieve.shelfOpen(formatNum(data.shelfNext.points), data.shelfNext.slots)
          }}</span>
        </div>
        <div class="dt-ach-shelf" data-testid="ach-shelf">
          <button
            v-for="k in shelf"
            :key="k"
            type="button"
            class="dt-ach-slot"
            :disabled="!data.mine"
            @click="openTrophy = k"
          >
            <AchTrophy :tone="trophyTone(k)" :size="46" />
            <span class="dt-ach-slot-name">{{ trophyName(k, catalog) }}</span>
          </button>
          <div
            v-for="i in Math.max(0, data.shelfSlots - shelf.length)"
            :key="`empty-${i}`"
            v-if="data.mine"
            class="dt-ach-slot is-empty"
          >
            {{ t.achieve.shelfEmpty }}
          </div>
          <div v-if="data.mine && data.shelfNext" class="dt-ach-slot is-empty">
            {{ t.achieve.shelfLocked(formatNum(data.shelfNext.points)) }}
          </div>
        </div>
      </section>
      <section class="dt-block">
        <div class="dt-block-head">
          <h2 class="dt-block-title">{{ t.achieve.trophiesAll }}</h2>
          <span class="dt-meta">{{ myTrophies.size }} / {{ trophyKeys.length }}</span>
        </div>
        <div class="dt-ach-case" data-testid="ach-case">
          <button
            v-for="k in trophyOrder"
            :key="k"
            type="button"
            :class="['dt-ach-cell', { 'is-off': !myTrophies.has(k) }]"
            :data-testid="`ach-trophy-${k}`"
            @click="openTrophy = k"
          >
            <span v-if="shelf.includes(k)" class="dt-ach-pin">{{ shelf.indexOf(k) + 1 }}</span>
            <AchTrophy
              :tone="trophyTone(k)"
              :locked="!myTrophies.has(k)"
              :size="40"
              :label="myTrophies.has(k) ? '' : t.achieve.trophyMissing"
            />
            <span class="dt-ach-cell-name">{{ trophyName(k, catalog) }}</span>
          </button>
        </div>
        <p class="dt-meta">{{ t.achieve.trophiesHint }}</p>
      </section>
    </template>

    <!-- ② 分类 -->
    <template v-else>
      <div class="dt-ach-filter">
        <span class="dt-select-pill">
          <select v-model="cat" :aria-label="t.achieve.catLabel" data-testid="ach-cat-select">
            <option v-for="c in cats" :key="c.key" :value="c.key">
              {{ t.achieve.catOption(t.achieve.tabs[c.key], c.got, c.total) }}
            </option>
          </select>
        </span>
        <div class="dt-pills" role="group" :aria-label="t.achieve.filterLabel">
          <button
            v-for="f in ['all', 'doing', 'done'] as const"
            :key="f"
            type="button"
            :class="{ active: filter === f }"
            :aria-pressed="filter === f"
            @click="filter = f"
          >
            {{ t.achieve.filters[f] }}
          </button>
        </div>
      </div>
      <div class="dt-card dt-rows-card" data-testid="ach-lines">
        <button
          v-for="s in lines"
          :key="s.line.key"
          type="button"
          class="dt-row is-link dt-ach-line"
          :data-testid="`ach-line-${s.line.key}`"
          @click="openLine = s.line"
        >
          <AchTrophy
            v-if="lineTrophy(s.line)"
            :tone="lineTrophy(s.line)!.tone"
            :locked="lineTrophy(s.line)!.locked"
            :size="30"
          />
          <span v-else class="dt-ach-ico" aria-hidden="true">★</span>
          <div class="dt-row-main">
            <span class="dt-row-title">{{ lineName(s.line, catalog) }}</span>
            <span class="dt-meta">
              <template v-if="s.done">{{ t.achieve.maxed(s.line.desc) }}</template>
              <template v-else-if="s.cur !== null && s.next">{{
                t.achieve.progress(s.line.desc, formatNum(s.cur), tierText(s.line, s.next))
              }}</template>
              <template v-else>{{ s.line.desc }}</template>
            </span>
            <span class="dt-ach-tiers" :aria-label="t.achieve.tierAria(s.got, s.line.tiers.length)">
              <i v-for="x in segs(s.line)" :key="x.id" :class="{ 'is-on': x.on, 'is-cup': x.cup }" />
            </span>
          </div>
          <span v-if="s.next" class="dt-ach-side"
            ><b>{{ t.achieve.nextPts(s.next.pts) }}</b
            >{{ t.achieve.nextLabel }}</span
          >
        </button>
      </div>
    </template>
  </template>

  <!-- ③ 成就线面板 -->
  <DtSheet
    :open="openLine !== null"
    :title="openLine ? lineName(openLine, catalog) : ''"
    @close="openLine = null"
  >
    <template v-if="openLine && openState && data">
      <p class="dt-meta">{{ openLine.desc }}</p>
      <div v-if="openState.next && openState.cur !== null" class="dt-ach-sum">
        <div class="dt-meta">
          <span>{{ t.achieve.now }}</span
          ><b>{{ formatNum(openState.cur) }}</b>
        </div>
        <div class="dt-meter"><i :style="{ width: meterPct(openState.cur, openState.next.n) }" /></div>
        <div class="dt-meta">
          <span>{{ t.achieve.nextTier(tierText(openLine, openState.next)) }}</span>
          <span>{{ t.achieve.left(formatNum(Math.max(0, openState.next.n - openState.cur))) }}</span>
        </div>
      </div>
      <p v-else-if="openState.done" class="dt-meta">{{ t.achieve.allDone }}</p>
      <ol class="dt-ach-tier-list" data-testid="ach-tiers">
        <li
          v-for="x in openLine.tiers"
          :key="x.id"
          :class="[
            'dt-ach-tier',
            gotSet.has(x.id) ? 'is-done' : x.id === openState.next?.id ? 'is-next' : 'is-locked',
          ]"
        >
          <span class="dt-ach-dot">{{ gotSet.has(x.id) ? '✓' : x.tier }}</span>
          <span class="dt-ach-tier-main">
            {{ tierText(openLine, x) }}
            <span v-if="x.trophy" class="dt-tag dt-tag-warn">{{
              t.achieve.trophyTag(trophyName(x.trophy, catalog))
            }}</span>
            <span v-if="x.icon" class="dt-tag dt-tag-primary">{{
              t.achieve.titleTag(iconTitle(x.icon))
            }}</span>
            <span v-if="gotMap.get(x.id)?.first" class="dt-tag dt-tag-warn">{{ t.achieve.first }}</span>
          </span>
          <span class="dt-ach-side">
            <b>{{ t.achieve.tierPts(x.pts) }}</b>
            {{
              gotMap.get(x.id)
                ? achWhen(gotMap.get(x.id)!.at)
                : t.achieve.rarity(rarityText(data.rarity[x.id]))
            }}
          </span>
        </li>
      </ol>
    </template>
  </DtSheet>

  <!-- 奖杯面板 -->
  <DtSheet
    :open="openTrophy !== null"
    :title="openTrophy ? trophyName(openTrophy, catalog) : ''"
    @close="openTrophy = null"
  >
    <template v-if="openTrophy && data">
      <div class="dt-detail-head">
        <span class="dt-detail-art"
          ><AchTrophy :tone="trophyTone(openTrophy)" :locked="!myTrophies.has(openTrophy)" :size="56"
        /></span>
        <div class="dt-min0">
          <div v-if="trophySource(openTrophy, catalog)" class="dt-meta">
            {{
              t.achieve.trophyFrom(
                lineName(trophySource(openTrophy, catalog)!.line, catalog),
                tierText(trophySource(openTrophy, catalog)!.line, trophySource(openTrophy, catalog)!.tier),
              )
            }}
          </div>
          <div class="dt-meta">
            {{ trophyAt(openTrophy) ? t.achieve.trophyGot(trophyAt(openTrophy)!) : t.achieve.trophyMissing }}
          </div>
        </div>
      </div>
    </template>
    <template v-if="openTrophy && data?.mine && myTrophies.has(openTrophy)" #actions>
      <button
        type="button"
        class="btn btn-primary dt-btn-block"
        :disabled="busy"
        data-testid="ach-shelf-toggle"
        @click="toggleShelf(openTrophy)"
      >
        {{ shelf.includes(openTrophy) ? t.achieve.shelfTake : t.achieve.shelfPut }}
      </button>
    </template>
  </DtSheet>
</template>
