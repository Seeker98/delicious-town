<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityDto, CoopDef } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { actionName } from '../../utils/activity';
import { formatNum } from '../../utils/format';
import { rewardSummary } from '../../utils/reward';
import RewardButton from './RewardButton.vue';

/** 全服合力卡片（148-3 设计 §8.2）：全服总分、里程碑、贡献榜 */
const props = defineProps<{ a: ActivityDto & { kind: 'coop'; def: CoopDef }; busy: boolean }>();
defineEmits<{ claim: [key: string] }>();
const catalog = useCatalogStore();
const board = computed(() => props.a.coop ?? { pool: 0, top: [], myRank: null });
const mine = computed(() => props.a.counters.points ?? 0);
const ms = computed(() => props.a.def.milestones);
/** 下一个还没到的里程碑；-1 = 全部达成 */
const nextIdx = computed(() => ms.value.findIndex((m) => m.target > board.value.pool));
/** 进度条：从上一个里程碑到下一个里程碑 */
const progress = computed(() => {
  if (nextIdx.value < 0) return 100;
  const lo = nextIdx.value === 0 ? 0 : ms.value[nextIdx.value - 1]!.target;
  const hi = ms.value[nextIdx.value]!.target;
  return Math.floor(((board.value.pool - lo) / (hi - lo)) * 100);
});
function hint(i: number): string {
  const m = ms.value[i]!;
  if (board.value.pool < m.target) return `全服还差 ${formatNum(m.target - board.value.pool)} 分`;
  // 门槛为 0 时也要至少有 1 分（终审 I1）
  const need = Math.max(1, m.minContribution);
  if (mine.value < need) return `个人贡献还差 ${formatNum(need - mine.value)} 分`;
  return '';
}
const rankLabel = (r: { from: number; to: number }) =>
  r.from === r.to ? `第 ${r.from} 名` : `第 ${r.from}~${r.to} 名`;
</script>

<template>
  <div class="mb-1" :data-testid="`coop-head-${a.id}`">
    全服 <b>{{ formatNum(board.pool) }}</b> 分 · 我的贡献 {{ formatNum(mine) }} 分<template
      v-if="board.myRank !== null"
    >
      · 第 {{ board.myRank }} 名</template
    >
  </div>
  <div class="progress mb-1" style="height: 0.5rem">
    <div class="progress-bar" :style="{ width: `${progress}%` }" :data-testid="`coop-bar-${a.id}`"></div>
  </div>
  <div v-if="nextIdx < 0" class="small text-success mb-2">全部里程碑已达成</div>
  <div class="small text-muted mb-2">
    今天：
    <span v-for="r in a.def.rules" :key="r.key" class="me-2"
      >{{ actionName(r.key) }} {{ a.today[r.key] ?? 0 }}/{{ r.dailyCap }}</span
    >
  </div>
  <div
    v-for="(m, i) in a.def.milestones"
    :key="`s${i}`"
    class="d-flex flex-wrap align-items-center gap-2 border-bottom py-1 small"
  >
    <span class="flex-fill"
      >全服 {{ formatNum(m.target) }} 分<span v-if="m.minContribution > 0" class="small text-muted"
        >（个人 ≥ {{ formatNum(m.minContribution) }} 分）</span
      ></span
    >
    <span v-if="hint(i)" class="small text-muted" :data-testid="`coop-hint-${a.id}-${i}`">{{ hint(i) }}</span>
    <RewardButton
      :activity-id="a.id"
      :reward="a.rewards[i]!"
      :state="a.state"
      :busy="busy"
      @claim="$emit('claim', $event)"
    />
  </div>
  <template v-if="a.def.ranks.length > 0 || board.top.length > 0">
    <div class="small fw-bold mt-2">贡献榜</div>
    <div v-if="a.state === 'ended'" class="small text-muted">
      贡献榜已结算{{ a.def.ranks.length > 0 ? '，奖励已发邮件' : '' }}
    </div>
    <div v-else-if="a.state === 'settling'" class="small text-muted">贡献榜结算中</div>
    <div v-for="(r, i) in a.def.ranks" :key="`r${i}`" class="small">
      {{ rankLabel(r) }}：{{ rewardSummary(r.award, catalog) }}
    </div>
    <table v-if="board.top.length > 0" class="table table-sm mt-1 mb-0" :data-testid="`coop-top-${a.id}`">
      <tbody>
        <tr v-for="r in board.top" :key="r.restId" :class="{ 'fw-bold': r.mine }">
          <td>{{ r.rank }}</td>
          <td>{{ r.name }}</td>
          <td class="text-end">{{ formatNum(r.points) }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
