<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { useT } from '../../composables/useT';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';

/**
 * 首页营业状态卡（界面改版 P5，样稿 B，设计 §1.1 第 2 条“每页一个主角”）：
 * 停业（油用光）时整宽主按钮“加满”；营业中显示油量条，加油是次要按钮；油满时按钮灰掉写“油是满的”。
 * 银币不够加满时有多少加多少（服务端同样处理），按钮写“加油”和实际花费。
 */
const props = defineProps<{ rest: RestaurantDto; busy: boolean }>();
defineEmits<{ refuel: [] }>();
const t = useT();
const closed = computed(() => props.rest.state === 2);
const need = computed(() => Math.max(0, props.rest.oilMax - props.rest.oil));
const cost = computed(() => Math.min(need.value, props.rest.coin));
const full = computed(() => need.value === 0);
/** 能加满（银币够）写“加满”，不够写“加油” */
const fillsUp = computed(() => cost.value >= need.value);
const pct = computed(() =>
  props.rest.oilMax > 0 ? Math.min(100, Math.floor((props.rest.oil / props.rest.oilMax) * 100)) : 0,
);
/** 停业时那一行提示：没有银币时写清楚加不了油（backlog P5），否则写“加满就能继续营业” */
const closedHint = computed(() =>
  cost.value <= 0 && !full.value ? t.value.home.noCoinHint : t.value.home.statusClosedHint,
);
const label = computed(() =>
  full.value ? t.value.home.oilFull : t.value.home.refuel(fillsUp.value, formatNum(cost.value)),
);
</script>

<template>
  <section :class="['dt-home-oil', { 'is-closed': closed }]" data-testid="home-oil">
    <div class="dt-home-oil-head">
      <span class="dt-home-oil-ico"><DtArt name="res-oil" :size="closed ? 36 : 28" /></span>
      <div class="dt-home-oil-main">
        <div class="dt-home-oil-title">{{ closed ? t.home.statusClosed : t.home.statusOpen }}</div>
        <div class="dt-home-oil-line">
          <span class="visually-hidden">{{ t.events.kind.oil }}</span
          ><span data-testid="rest-oil" :class="{ 'text-danger': rest.oil === 0 }">{{
            formatNum(rest.oil)
          }}</span
          >/{{ formatNum(rest.oilMax) }}
          <!-- 油壶扩容的入口（问题记录 435） -->
          <RouterLink
            to="/society/oil"
            class="dt-home-oil-up"
            :title="t.home.oilUpgrade"
            :aria-label="t.home.oilUpgrade"
            data-testid="oil-upgrade"
            ><i class="bi bi-arrow-up-circle" aria-hidden="true"></i
          ></RouterLink>
          <span v-if="closed" class="dt-home-oil-hint" data-testid="oil-closed-hint">{{ closedHint }}</span>
        </div>
        <div
          v-if="!closed"
          class="dt-home-oil-bar"
          role="progressbar"
          :aria-valuenow="pct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t.events.kind.oil"
        >
          <span :style="{ width: `${pct}%` }"></span>
        </div>
      </div>
      <button
        v-if="!closed"
        type="button"
        class="btn btn-sm btn-outline-primary dt-home-oil-btn"
        data-testid="refuel"
        :title="label"
        :aria-label="label"
        :disabled="busy || cost <= 0"
        @click="$emit('refuel')"
      >
        <template v-if="full">{{ t.home.oilFull }}</template>
        <template v-else
          ><span class="text-truncate">{{ t.home.refuelShort(fillsUp) }}</span
          ><span class="flex-shrink-0"
            ><DtArt name="res-coin-silver" :size="14" />{{ formatNum(cost) }}</span
          ></template
        >
      </button>
    </div>
    <!-- 停业时加油是这一页的主操作：整宽胶囊 -->
    <button
      v-if="closed"
      type="button"
      class="btn btn-primary dt-btn-block dt-home-oil-btn"
      data-testid="refuel"
      :title="label"
      :aria-label="label"
      :disabled="busy || cost <= 0"
      @click="$emit('refuel')"
    >
      <template v-if="full">{{ t.home.oilFull }}</template>
      <template v-else
        ><span class="text-truncate">{{ t.home.refuelShort(fillsUp) }}</span
        ><span class="flex-shrink-0"
          ><DtArt name="res-coin-silver" :size="16" />{{ formatNum(cost) }}</span
        ></template
      >
    </button>
  </section>
</template>
