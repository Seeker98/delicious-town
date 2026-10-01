<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { RANK_BOARDS, RANK_GROUPS, type LeaderboardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import { shortNum } from '../../utils/format';

/** 排行榜（4E-2 设计文档 §5）：大类胶囊 + 小类按钮组；厨力榜 10 分钟更新，其他每分钟 */
const session = useSessionStore();
const toast = useToastStore();
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
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

let seq = 0;
async function load() {
  const n = ++seq;
  try {
    const v = await endpoints.rank(key.value);
    if (n === seq) data.value = v;
  } catch (e) {
    if (n === seq) toast.push(errorMessage(e, '读取排行失败'), 'danger');
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
</script>

<template>
  <div data-testid="rank-panel">
    <div class="dt-pills mb-2">
      <a
        v-for="g in RANK_GROUPS"
        :key="g"
        href="#"
        :class="{ active: group === g }"
        :aria-current="group === g ? 'true' : undefined"
        :data-testid="`rank-group-${g}`"
        @click.prevent="pickGroup(g)"
        >{{ g }}</a
      >
    </div>
    <div v-if="subs.length > 1" class="btn-group btn-group-sm flex-wrap mb-2">
      <button
        v-for="b in subs"
        :key="b.key"
        :class="['btn', key === b.key ? 'btn-primary' : 'btn-outline-primary']"
        :data-testid="`rank-board-${b.key}`"
        @click="key = b.key"
      >
        {{ b.label }}
      </button>
    </div>
    <div class="dt-meta mb-1" data-testid="rank-meta">
      {{ key === 'power' ? '每 10 分钟更新' : '每分钟更新'
      }}<span v-if="data"> · 更新于 {{ hhmm(data.updatedAt) }}</span>
    </div>
    <div v-if="def.reward" class="dt-meta mb-2" data-testid="rank-reward">奖励：{{ def.reward }}</div>
    <template v-if="data">
      <div v-if="data.rows.length === 0" class="dt-empty">还没有人上榜</div>
      <div
        v-for="r in data.rows"
        :key="r.restId"
        :class="['dt-item', { 'dt-item-me': r.restId === mine }]"
        :data-testid="`rank-row-${r.restId}`"
      >
        <span class="dt-rank-no">{{ r.rank }}</span>
        <div class="dt-item-main">
          <RouterLink :to="r.restId === mine ? '/' : `/friends/${r.restId}`" class="dt-item-title">{{
            r.name
          }}</RouterLink>
        </div>
        <span class="fw-bold">{{ shortNum(r.value) }}</span>
      </div>
      <div v-if="data.me && !meInRows" class="dt-item dt-item-me mt-2" data-testid="rank-me">
        我：第 {{ data.me.rank }} 名 · {{ shortNum(data.me.value) }}
      </div>
    </template>
    <div class="dt-meta mt-2">赛厨榜在厨塔、克拉肯月榜在神殿查看</div>
  </div>
</template>
