<script setup lang="ts">
import JobCardNote from '../components/JobCardNote.vue';
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { predictPercent, type PredictEventDto, type PredictListDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { predictNote, predictTitle } from '../utils/serverText';
import { useCatalogStore } from '../stores/catalog';
import { predictLeft, predictReason } from '../utils/predict';

/**
 * 事件预测（238-1 设计 §7.2）：用银币买卖"是/否"份额，系统按公式报价。
 * 界面改版 P8：列表一行一个事件（标题、概率条、剩余时间、我的持仓），点了进详情页 /predict/编号
 */
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const list = ref<PredictListDto | null>(null);
const helpOpen = ref(false);

const open = computed(() => list.value?.events.filter((e) => e.status === 'open') ?? []);
/** 已结束的按截止时间从新到旧（问题记录 449）；同一时间编号大的在前 */
const ended = computed(() =>
  (list.value?.events.filter((e) => e.status !== 'open') ?? []).sort(
    (a, b) => b.closeAt.localeCompare(a.closeAt) || b.id - a.id,
  ),
);
const reasonText = computed(() => t.value && predictReason(list.value));
const failed = ref(false);
const profit = (e: PredictEventDto) => (e.payout === null ? null : e.payout - e.netCost);
/** 已结束的结果标签：是 / 否，没判定的写状态（等待判定、已作废）（问题记录 288） */
const endedTag = (e: PredictEventDto) =>
  e.status === 'resolved' ? t.value.predict.result(!!e.outcome) : t.value.predict.status[e.status];
const endedTagClass = (e: PredictEventDto) => (e.status === 'resolved' ? 'dt-tag-primary' : 'dt-tag-mute');
/** 已结束的超过 5 个先收起（问题记录 288） */
const ENDED_SHOWN = 5;
const endedAll = ref(false);
const endedShown = computed(() => (endedAll.value ? ended.value : ended.value.slice(0, ENDED_SHOWN)));
/** "怎么玩"整页只放一份（以前每张详情卡里各一份，问题记录 288）；金额按区服默认的每份结算 */
const helpItems = computed(() => {
  const l = list.value;
  if (!l) return [];
  return t.value.predict.detail.helpItems(
    formatNum(l.unit),
    formatNum(Math.round(l.unit * 0.63)),
    Math.round(l.feeRate * 100),
  );
});
const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNum(n)}`;

async function loadList() {
  try {
    list.value = await endpoints.predictList();
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
onMounted(() => void loadList());
</script>

<template>
  <DtEmpty v-if="!list && failed" :title="t.common.loadFailed" data-testid="pd-failed" />
  <DtSkeleton v-else-if="!list" :rows="4" />
  <template v-else>
    <div v-if="!list.enabled" class="dt-act-note" data-testid="pd-off">{{ t.predict.off }}</div>
    <div v-if="reasonText" class="dt-act-note is-warn" data-testid="pd-reason">{{ reasonText }}</div>
    <JobCardNote v-if="list.feeCard" :card="list.feeCard" />
    <div class="dt-card dt-rows-card">
      <!-- 玩法说明整页一份，点开从下面弹出（问题记录 288） -->
      <button type="button" class="dt-row is-link" data-testid="pd-help" @click="helpOpen = true">
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.predict.detail.help }}</span
          ><span class="dt-row-sub">{{ t.predict.helpSub }}</span></span
        >
      </button>
    </div>

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.predict.running }}</h2>
        <span class="dt-block-more">{{ open.length }}</span>
      </div>
      <DtEmpty v-if="open.length === 0" :title="t.predict.noRunning" />
      <div v-else class="dt-card dt-rows-card">
        <RouterLink
          v-for="e in open"
          :key="e.id"
          :to="`/predict/${e.id}`"
          class="dt-pd-ev"
          :data-testid="`pd-event-${e.id}`"
        >
          <span class="dt-pd-ev-head">
            <span class="dt-pd-ev-title"
              >{{ predictTitle(e, catalog)
              }}<span v-if="e.auto" class="dt-tag-primary" :data-testid="`pd-auto-${e.id}`">{{
                t.predict.auto
              }}</span></span
            >
            <span class="dt-pd-ev-pct">{{ t.predict.yesPct(predictPercent(e.price)) }}</span>
          </span>
          <!-- 是/否概率条（问题记录 288） -->
          <span class="dt-pd-split" :data-testid="`pd-bar-${e.id}`"
            ><i data-testid="pd-bar-yes" :style="{ width: `${predictPercent(e.price)}%` }"></i
          ></span>
          <span class="dt-row-sub"
            >{{ predictLeft(e.closeAt)
            }}<template v-if="e.yes > 0 || e.no > 0">{{ t.predict.holding(e.yes, e.no) }}</template></span
          >
        </RouterLink>
      </div>
    </section>

    <section v-if="ended.length > 0" class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.predict.ended }}</h2>
      </div>
      <!-- 已结束：标出结果和我的盈亏；超过 5 个先收起（问题记录 288） -->
      <div class="dt-card dt-rows-card">
        <RouterLink
          v-for="e in endedShown"
          :key="e.id"
          :to="`/predict/${e.id}`"
          class="dt-row is-link dt-row-wrap"
          :data-testid="`pd-ended-${e.id}`"
        >
          <span class="dt-row-main">
            <span class="dt-row-title is-strong">{{ predictTitle(e, catalog) }}</span>
            <span class="dt-row-sub"
              ><span :class="endedTagClass(e)" data-testid="pd-ended-tag">{{ endedTag(e) }}</span
              >{{ t.predict.endedHold(e.yes, e.no)
              }}<span
                v-if="profit(e) !== null"
                data-testid="pd-ended-profit"
                :class="profit(e)! >= 0 ? 'text-success' : 'text-danger'"
                >{{ t.predict.profit(signed(profit(e)!)) }}</span
              ></span
            >
            <span v-if="predictNote(e, catalog)" class="dt-row-sub" :data-testid="`pd-ended-note-${e.id}`">{{
              t.predict.note(predictNote(e, catalog)!)
            }}</span>
          </span>
        </RouterLink>
      </div>
      <div v-if="ended.length > ENDED_SHOWN" class="dt-more-row">
        <button
          type="button"
          class="btn btn-light"
          data-testid="pd-ended-more"
          :aria-expanded="endedAll"
          @click="endedAll = !endedAll"
        >
          {{ endedAll ? t.predict.endedLess : t.predict.endedMore(ended.length) }}
        </button>
      </div>
    </section>

    <DtSheet :open="helpOpen" :title="t.predict.detail.help" @close="helpOpen = false">
      <div class="dt-help">
        <p>{{ t.predict.intro }}</p>
        <ul>
          <li v-for="(x, i) in helpItems" :key="i">{{ x }}</li>
        </ul>
      </div>
    </DtSheet>
  </template>
</template>
