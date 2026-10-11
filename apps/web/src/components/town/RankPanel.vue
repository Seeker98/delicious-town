<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { RANK_BOARDS, RANK_GROUPS, type LeaderboardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useRestaurantStore } from '../../stores/restaurant';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import { shortNum, timeHM } from '../../utils/format';
import DtArt from '../DtArt.vue';
import DtRow from '../DtRow.vue';

/**
 * 排行榜（4E-2 设计文档 §5；界面改版 P10）：大类胶囊一排横滑，小类是下拉胶囊、和更新时间同一行；
 * 一行名次圆章（前三金银铜）+ 头像 + 店名 + 数值；我不在榜上时底部吸住一条“我”；
 * 最后列出能在原地操作的榜（厨塔赛厨榜、收购身价榜、神殿克拉肯月榜）
 */
const session = useSessionStore();
const toast = useToastStore();
const catalog = useCatalogStore();
const restStore = useRestaurantStore();
const t = useT();
const KEY = 'dt_rank_board';

function initialKey(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v && RANK_BOARDS.some((b) => b.key === v)) return v;
  } catch {
    // 存储不可用时忽略
  }
  return RANK_BOARDS[0]!.key;
}
const key = ref(initialKey());
const def = computed(() => RANK_BOARDS.find((b) => b.key === key.value)!);
const group = computed(() => def.value.group);
const subs = computed(() => RANK_BOARDS.filter((b) => b.group === group.value));
const data = ref<LeaderboardDto | null>(null);
const mine = computed(() => session.me?.restaurantId ?? null);
const meInRows = computed(() => !!data.value?.rows.some((r) => r.restId === mine.value));

function pickGroup(g: string) {
  key.value = RANK_BOARDS.find((b) => b.group === g)!.key;
}
const hhmm = (iso: string) => timeHM(iso);
const rk = computed(() => t.value.town.rank);
/** 大类、小类、奖励的名字按语言；键对不上时退回共用定义里的简中 */
const groupName = (g: string) => rk.value.groups[RANK_GROUPS.indexOf(g)] ?? g;
const boardName = (b: { key: string; label: string }) =>
  rk.value.boards[b.key] ?? rk.value.periods[b.key.split('.').at(-1) ?? ''] ?? b.label;
const rewardOf = (b: { key: string; reward?: string }) =>
  b.reward ? (rk.value.rewards[b.key] ?? b.reward) : '';

let seq = 0;
async function load() {
  const n = ++seq;
  try {
    const v = await endpoints.rank(key.value);
    if (n === seq) data.value = v;
  } catch (e) {
    if (n === seq) toast.push(errorMessage(e, t.value.town.rank.loadFailed), 'danger');
  }
}
watch(key, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 存储不可用时忽略
  }
  void load();
});
onMounted(load);

/** 能在原地操作的榜：区服关掉的功能不列 */
const elsewhere = computed(() => {
  const e = rk.value.places;
  return [
    { to: '/tower?tab=rank', feature: 'tower', ...e.tower },
    { to: '/acquire?tab=price', feature: 'acquire', ...e.acquire },
    { to: '/temple?tab=kraken', feature: 'temple', ...e.kraken },
  ].filter((x) => restStore.featureOn(x.feature));
});
</script>

<template>
  <div data-testid="rank-panel">
    <div class="dt-pills dt-pills-scroll" role="group" :aria-label="rk.groupLabel">
      <button
        v-for="g in RANK_GROUPS"
        :key="g"
        type="button"
        :class="{ active: group === g }"
        :aria-pressed="group === g"
        :data-testid="`rank-group-${g}`"
        @click="pickGroup(g)"
      >
        {{ groupName(g) }}
      </button>
    </div>
    <div class="dt-rank-meta">
      <!-- 子榜用下拉胶囊：页面分区不超过两层（界面改版 P2b，原来是按钮组） -->
      <span v-if="subs.length > 1" class="dt-select-pill">
        <select v-model="key" :aria-label="groupName(group)" data-testid="rank-board-select">
          <option v-for="b in subs" :key="b.key" :value="b.key">{{ boardName(b) }}</option>
        </select>
      </span>
      <span class="dt-rank-meta-text" data-testid="rank-meta"
        >{{ key === 'power' ? rk.every10 : rk.every1
        }}<span v-if="data">{{ rk.updatedAt(hhmm(data.updatedAt)) }}</span></span
      >
    </div>
    <p v-if="def.reward" class="dt-block-note" data-testid="rank-reward">{{ rk.reward(rewardOf(def)) }}</p>
    <template v-if="data">
      <div v-if="data.rows.length === 0" class="dt-card dt-up-max mt-2">{{ rk.empty }}</div>
      <div v-else class="dt-card dt-rows-card mt-2">
        <DtRow
          v-for="r in data.rows"
          :key="r.restId"
          :to="r.restId === mine ? '/' : `/friends/${r.restId}`"
          strong
          :class="['dt-rank-row', { 'is-me': r.restId === mine }]"
          :data-testid="`rank-row-${r.restId}`"
        >
          <template #icon
            ><span :class="['dt-medal', r.rank <= 3 ? `is-${r.rank}` : '']">{{ r.rank }}</span></template
          >
          <template #title
            ><span class="dt-rank-name"
              ><span class="dt-rank-ava"
                ><DtArt :name="catalog.avatarArt(r.avatar ?? 0) ?? 'avatar-chef'" :size="28" /></span
              >{{ r.name }}</span
            ></template
          >
          <template #value
            ><b class="dt-rank-value">{{ shortNum(r.value) }}</b></template
          >
        </DtRow>
      </div>
    </template>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ rk.elsewhereTitle }}</h2>
      <span class="dt-block-more">{{ rk.elsewhereNote }}</span>
    </div>
    <div class="dt-card dt-rows-card">
      <DtRow
        v-for="x in elsewhere"
        :key="x.to"
        :to="x.to"
        strong
        :title="x.title"
        :sub="x.sub"
        :data-testid="`rank-elsewhere-${x.feature}`"
      />
    </div>
    <!-- 我不在上面的榜里：底部吸住一条写我的名次 -->
    <div v-if="data?.me && !meInRows" class="dt-sticky-bar dt-rank-me" data-testid="rank-me">
      <span class="dt-medal is-me">{{ data.me.rank }}</span>
      <span class="dt-sticky-bar-main">
        <b>{{ rk.meName(restStore.rest?.name ?? '') }}</b>
        <span>{{ rk.meSub(data.rows.length) }}</span>
      </span>
      <b class="dt-rank-value">{{ shortNum(data.me.value) }}</b>
    </div>
  </div>
</template>
