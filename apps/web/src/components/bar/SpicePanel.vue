<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BarDto, SpiceDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { awardText } from './award';
import { roundGone } from './gone';

/**
 * 秘制调料（问题记录 427-2）：猜调料的排列，回答几 A 几 B，猜得越快奖励越好。
 * 界面改版 P9：每次猜的结果一行，绿点是 A、黄圈是 B；下面空位和十种调料
 */
/** 调料前的小色点（下标是调料编号；色值在令牌 --dt-spice-0~9） */
const SPICE_COLORS = 10;
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const t = useT();
const toast = useToastStore();
const catalog = useCatalogStore();
const busy = ref(false);

/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<SpiceDto | null>(null);
watch(
  () => props.data.spice.round,
  (r) => {
    if (local.value?.result) return;
    // 概览可能比刚收到的结果晚到：比手上的局面旧（猜的次数更少）就不覆盖（#191 审查）
    if (r && local.value && r.guesses.length < local.value.guesses.length) return;
    local.value = r;
  },
  { immediate: true },
);
/** 已选的调料，按空位顺序；null 是空位 */
const picked = ref<Array<number | null>>([]);
const s = computed(() => props.data.spice);
/** 进行中的局按开局时的长度、种数（终审：区服中途改了数值，照新数值画空位交什么都被拒，这一局卡死）；没开局时按当前数值 */
const length = computed(() => local.value?.length ?? s.value.length);
const kinds = computed(() => local.value?.kinds ?? s.value.kinds);
const resetPicked = () => (picked.value = Array.from({ length: length.value }, () => null));
resetPicked();
// 页面开着时区服改了配方长度、或换了一局：空位跟着变（#191 审查）
watch(length, resetPicked);

const nameOf = (i: number) => t.value.bar.spice.kinds[i] ?? String(i);
const listOf = (ids: readonly number[]) => ids.map(nameOf).join(t.value.bar.spice.sep);
const full = computed(() => picked.value.every((x) => x !== null));
/** 按顺序填进第一个空位 */
function pick(i: number) {
  const at = picked.value.indexOf(null);
  if (at < 0 || picked.value.includes(i)) return;
  picked.value[at] = i;
}
function unpick(at: number) {
  picked.value[at] = null;
}

async function run(fn: () => Promise<SpiceDto>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    local.value = await fn();
    resetPicked();
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 局面不在了就回到开局；别的错误（网络、和服务端对不上）先用概览里的局面，再重新读（审查）
    resetPicked();
    local.value = roundGone(e) ? null : props.data.spice.round;
    emit('reload');
  } finally {
    busy.value = false;
  }
}
const submit = () => run(() => endpoints.barSpiceGuess(picked.value as number[]), t.value.bar.spice.failed);

const leftToday = computed(() => Math.max(0, s.value.max - s.value.played));
const block = computed(() =>
  leftToday.value <= 0
    ? t.value.bar.spice.noLeft
    : props.data.tickets < s.value.cost
      ? t.value.bar.spice.noTickets
      : '',
);
const tierRows = computed(() =>
  s.value.tiers.map((x, i) => ({
    from: i === 0 ? 1 : s.value.tiers[i - 1]!.maxTries + 1,
    to: x.maxTries,
    renown: x.renown,
  })),
);
/** 结果卡的标题：第几次猜中、声望；奖励单独用奖励小块 */
const resultHead = computed(() => {
  const r = local.value;
  if (!r?.result) return '';
  const x = t.value.bar.spice;
  if (r.result === 'lose') return x.lose(r.guesses.length || s.value.tries);
  return x.win(r.guesses.length) + (r.renown > 0 ? x.renown(r.renown) : '');
});
const liveText = computed(() => {
  const r = local.value;
  if (!r) return '';
  if (r.result) return resultText.value;
  const g = r.guesses.at(-1);
  return g ? t.value.bar.spice.row(r.guesses.length, listOf(g.guess), g.a, g.b) : '';
});
const resultText = computed(() => {
  const r = local.value;
  if (!r?.result) return '';
  const x = t.value.bar.spice;
  if (r.result === 'lose') return x.lose(r.guesses.length || s.value.tries);
  return (
    x.win(r.guesses.length) +
    (r.renown > 0 ? x.renown(r.renown) : '') +
    (r.award ? t.value.bar.gotAward(awardText(r.award, catalog)) : '')
  );
});
</script>

<template>
  <BarInfo
    game="spice"
    :title="t.bar.spice.title(length)"
    :sub="
      local && !local.result
        ? t.bar.spice.subPlaying(local.left, s.tiers[0]?.maxTries ?? 0)
        : t.bar.spice.sub(s.played, s.max, s.tiers[0]?.maxTries ?? 0)
    "
  >
    <template #rules>
      <table class="dt-bar-table">
        <tbody>
          <tr v-for="(x, i) in tierRows" :key="i">
            <td>{{ t.bar.spice.tierLine(x.from, x.to, x.renown) }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </BarInfo>
  <template v-if="!local">
    <div class="dt-card dt-rows-card">
      <div v-for="(x, i) in tierRows" :key="i" class="dt-row" :data-testid="`spice-tier-${i}`">
        <span :class="['dt-medal', i === 0 ? 'is-1' : '']">{{ i + 1 }}</span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.bar.spice.tierTitle(x.from, x.to) }}</span
          ><span class="dt-row-sub">{{ t.bar.spice.tierPrize(x.renown) }}</span></span
        >
      </div>
    </div>
    <button
      type="button"
      class="btn btn-primary dt-btn-block dt-bar-go"
      :disabled="busy || !!block"
      data-testid="spice-start"
      @click="run(() => endpoints.barSpiceStart(), t.bar.startFailed)"
    >
      {{ t.bar.spice.start(s.cost) }}
    </button>
    <div v-if="block" class="dt-bar-block">{{ block }}</div>
  </template>
  <template v-else>
    <!-- 读屏的固定播报区：最新一次的回答，结束时是结果（审查 I1：新插入的节点带 aria-live 不播报） -->
    <div class="visually-hidden" aria-live="polite" data-testid="spice-live">{{ liveText }}</div>
    <section v-if="local.guesses.length > 0" class="dt-card dt-bar-stage dt-spice-history">
      <div v-for="(g, i) in local.guesses" :key="i" class="dt-spice-row" :data-testid="`spice-row-${i}`">
        <!-- 读屏念整句（几 A 几 B 靠前面每次的反馈推理）；看得见的格子和圆点不念（P9 终审 I2） -->
        <span class="visually-hidden">{{ t.bar.spice.row(i + 1, listOf(g.guess), g.a, g.b) }}</span>
        <span class="dt-spice-ix" aria-hidden="true">{{ i + 1 }}</span>
        <span class="dt-spice-cells" aria-hidden="true"
          ><span v-for="(k, j) in g.guess" :key="j">{{ nameOf(k) }}</span></span
        >
        <span class="dt-spice-pegs" aria-hidden="true"
          ><i v-for="j in g.a" :key="`a${j}`" class="is-a"></i
          ><i v-for="j in g.b" :key="`b${j}`" class="is-b"></i
          ><i v-for="j in Math.max(0, length - g.a - g.b)" :key="`n${j}`"></i
        ></span>
      </div>
      <p class="dt-spice-legend">
        <span><i class="is-a"></i>{{ t.bar.spice.legendA }}</span>
        <span><i class="is-b"></i>{{ t.bar.spice.legendB }}</span>
      </p>
    </section>
    <template v-if="!local.result">
      <section class="dt-card dt-bar-stage">
        <p class="dt-bar-label">{{ t.bar.spice.nthTry(local.guesses.length + 1) }}</p>
        <div class="dt-spice-slots" :style="{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }">
          <button
            v-for="(x, i) in picked"
            :key="i"
            type="button"
            :class="['dt-spice-slot', { 'is-full': x !== null }]"
            :aria-label="t.bar.spice.slot(i + 1, x === null ? null : nameOf(x))"
            :disabled="busy || x === null"
            :data-testid="`spice-slot-${i}`"
            @click="unpick(i)"
          >
            {{ x === null ? '' : nameOf(x) }}
          </button>
        </div>
        <div class="dt-spice-kinds">
          <button
            v-for="i in kinds"
            :key="i - 1"
            type="button"
            class="dt-spice-kind"
            :disabled="busy || picked.includes(i - 1) || full"
            :data-testid="`spice-kind-${i - 1}`"
            @click="pick(i - 1)"
          >
            <i :style="{ background: `var(--dt-spice-${(i - 1) % SPICE_COLORS})` }" aria-hidden="true"></i
            >{{ nameOf(i - 1) }}
          </button>
        </div>
      </section>
      <button
        type="button"
        class="btn btn-primary dt-btn-block dt-bar-go"
        :disabled="busy || !full"
        data-testid="spice-submit"
        @click="submit"
      >
        {{ full ? t.bar.spice.submit : t.bar.spice.submitShort(picked.filter((x) => x === null).length) }}
      </button>
    </template>
    <section
      v-else
      :class="['dt-bar-result', local.result === 'win' ? 'is-ok' : 'is-bad']"
      data-testid="spice-result"
    >
      <b>{{ resultHead }}</b>
      <div v-if="local.secret" class="dt-bar-detail" data-testid="spice-secret">
        {{ t.bar.spice.secret(listOf(local.secret)) }}
      </div>
      <div v-if="local.award" class="dt-award-chips"><AwardChip :award="local.award" /></div>
      <button
        type="button"
        class="btn btn-outline-primary dt-btn-block"
        data-testid="spice-again"
        @click="local = null"
      >
        {{ t.bar.again }}
      </button>
    </section>
  </template>
</template>
