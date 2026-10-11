<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { BarDto, CupDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DtArt from '../DtArt.vue';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { awardText } from './award';
import { roundGone } from './gone';

/**
 * 猜酒杯（问题记录 427-5）：一局闯关，杯子一轮比一轮多；猜中可以收手或继续，猜错什么都没有。
 * 界面改版 P9：上面一条轮次进度，杯子掀开露出骰子，猜中后在结果卡里选收手或继续
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

const c = computed(() => props.data.cup);
/** 局面进度：每轮猜中 +1、进下一轮再 +1 */
const progress = (r: CupDto) => r.round * 2 + (r.won ? 1 : 0);
/** 当前局面：结束的结果留着展示，否则跟着概览里进行中的局 */
const local = ref<CupDto | null>(null);
watch(
  () => props.data.cup.round,
  (r) => {
    if (local.value?.result) return;
    // 概览可能比刚收到的结果晚到：比手上的局面旧就不覆盖
    if (r && local.value && progress(r) < progress(local.value)) return;
    local.value = r;
  },
  { immediate: true },
);
/** 读屏播报：每次猜的结果、进下一轮、结束 */
const live = ref('');
const root = ref<HTMLElement | null>(null);
/** 按钮变灰或换掉后键盘焦点会丢：挪到接下来要点的地方（#193 审查） */
async function focusNext() {
  await nextTick();
  const r = local.value;
  // 开新局时礼券不够、杯子都灰着：落到写原因的那行，不丢回页面开头（#194 遗留）
  const id = r?.result ? 'cup-again' : r?.won ? 'cup-stop' : block.value ? 'block' : 'cup-0';
  root.value?.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.focus();
}

const streak = computed(() => (c.value.result === 'win' ? c.value.times : 0));
const block = computed(() =>
  !local.value && props.data.tickets < c.value.cost ? t.value.bar.cup.noTickets(c.value.cost) : '',
);
const sub = computed(() => {
  const x = t.value.bar.cup;
  const base = x.sub(c.value.cups.length);
  return streak.value > 0 ? t.value.bar.home.join(base, t.value.bar.streak(streak.value)) : base;
});
/** 轮次进度：已闯过的轮打勾，这一轮高亮 */
const passed = computed(() => {
  const r = local.value;
  if (!r) return 0;
  // 收手时服务端回的 won 是 false，但这一轮已经猜中了，也算闯过
  return r.round + (r.won || r.result === 'clear' || r.result === 'stop' ? 1 : 0);
});
/** 桌上几个杯子：没开局时是第 1 轮 */
const cupCount = computed(() => local.value?.cups ?? c.value.cups[0]!);
const decided = computed(() => !!local.value && (local.value.won || !!local.value.result));
/** 翻开的杯子：猜过以后才有 */
const shown = computed(() => (decided.value ? local.value!.last : null));
const cupState = (i: number) => {
  const s = shown.value;
  if (!s) return '';
  const x = t.value.bar.cup;
  return [s.pick === i ? x.yours : '', s.ball === i ? x.ball : ''].filter(Boolean).join(t.value.bar.cup.sep);
};

const pickText = (r: CupDto | null) => t.value.bar.cup.pick((r?.round ?? 0) + 1, r?.cups ?? c.value.cups[0]!);
const wonText = (r: CupDto) =>
  t.value.bar.cup.won(c.value.tiers[r.round]?.awards ?? 0, r.round + 2, c.value.cups[r.round + 1] ?? 0);
function resultHead(r: CupDto): string {
  const x = t.value.bar.cup;
  if (r.result === 'lose') return x.lose((r.last?.ball ?? 0) + 1);
  if (r.result === 'clear') return x.clear(r.last?.lucky ? t.value.bar.luckily : '');
  return x.stopped(r.round + 1);
}
const awardLines = (r: CupDto) => r.awards.map((a) => t.value.bar.cup.got(awardText(a, catalog)));
/** 掀开的杯子：你选的和骰子所在的 */
const lifted = (i: number) => !!shown.value && (shown.value.pick === i || shown.value.ball === i);
function liveOf(r: CupDto): string {
  if (r.result) return [resultHead(r), ...awardLines(r)].join(t.value.bar.cup.sep);
  return r.won ? `${t.value.bar.cup.wonHead(!!r.last?.lucky)}${wonText(r)}` : pickText(r);
}

async function run(fn: () => Promise<CupDto>) {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await fn();
    local.value = r;
    live.value = liveOf(r);
    emit('reload');
    void focusNext();
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.cup.failed), 'danger');
    // 局面没了就回到开局；别的错误（网络、和服务端对不上）先用概览里的局面，再重新读
    local.value = roundGone(e) ? null : props.data.cup.round;
    emit('reload');
  } finally {
    busy.value = false;
  }
}
function again() {
  local.value = null;
  live.value = '';
  void focusNext();
}
/** 奖励表里标出这一轮的档：没开局时不标 */
const nowTier = computed(() => (local.value && local.value.result !== 'lose' ? local.value.round : -1));
</script>

<template>
  <div ref="root">
    <BarInfo game="cup" :title="t.bar.cup.title(c.cost)" :sub="sub">
      <template #rules>
        <table class="dt-bar-table">
          <thead>
            <tr>
              <th>{{ t.bar.cup.colRound }}</th>
              <th>{{ t.bar.cup.colCups }}</th>
              <th>{{ t.bar.cup.colAwards }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(x, i) in c.tiers" :key="i">
              <td>{{ t.bar.cup.roundN(i + 1) }}</td>
              <td>{{ t.bar.cup.cupsN(c.cups[i]!) }}</td>
              <td>{{ t.bar.cup.awardsN(x.awards) }}</td>
              <td>
                <span
                  v-if="x.news"
                  :class="x.news === 'broadcast' ? 'dt-tag-danger' : 'dt-tag dt-tag-warn'"
                  >{{ t.bar.cup.news[x.news] }}</span
                >
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </BarInfo>
    <section class="dt-card dt-bar-stage">
      <!-- 局里也显示，标出这一轮的档，方便决定收手还是继续（#193 审查） -->
      <ol class="dt-bar-track">
        <li
          v-for="(x, i) in c.tiers"
          :key="i"
          :class="{ 'is-done': i < passed, 'is-now': i === nowTier && i >= passed }"
          :aria-current="i === nowTier ? 'true' : undefined"
          :data-testid="`cup-tier-${i}`"
        >
          <span class="dt-bar-track-dot" aria-hidden="true">{{ i < passed ? '✓' : i + 1 }}</span
          >{{ t.bar.cup.tierShort(c.cups[i]!, x.awards)
          }}<span v-if="x.news" class="d-block">{{ t.bar.cup.news[x.news] }}</span>
        </li>
      </ol>
      <p v-if="!decided" class="dt-bar-label dt-bar-pick" data-testid="cup-pick">{{ pickText(local) }}</p>
      <div class="dt-cups">
        <button
          v-for="i in cupCount"
          :key="i - 1"
          type="button"
          :class="['dt-cup-btn', { 'is-up': lifted(i - 1), 'is-mine': shown?.pick === i - 1 }]"
          :disabled="busy || !!block || decided"
          :aria-label="t.bar.cup.cupLabel(i, cupState(i - 1))"
          :data-testid="`cup-${i - 1}`"
          :data-cup="i - 1"
          @click="run(() => endpoints.barCupGuess(i - 1, local?.round ?? null))"
        >
          <span class="dt-cup-pic" aria-hidden="true"
            ><span v-if="shown?.ball === i - 1" class="dt-cup-die"><DtArt name="game-die" :size="26" /></span
            ><span class="dt-cup-lid"><DtArt name="game-cup-one" :size="56" /></span></span
          ><span>{{ t.bar.cup.cup(i) }}</span
          ><span v-if="cupState(i - 1)" class="dt-cup-state">{{ cupState(i - 1) }}</span>
        </button>
      </div>
    </section>
    <div v-if="block" class="dt-bar-block" tabindex="-1" data-testid="block">{{ block }}</div>
    <!-- 读屏的固定播报区：每次猜的结果、进下一轮、结束 -->
    <div class="visually-hidden" aria-live="polite" data-testid="cup-live">{{ live }}</div>
    <section v-if="local?.won && !local.result" class="dt-bar-result is-ok" data-testid="cup-won">
      <b>{{ t.bar.cup.wonHead(!!local.last?.lucky) }}</b>
      <div>{{ wonText(local) }}</div>
      <div class="dt-bar-warn">{{ t.bar.cup.wonWarn }}</div>
      <div class="dt-bar-pair">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy"
          data-testid="cup-stop"
          @click="run(() => endpoints.barCupStop())"
        >
          {{ t.bar.cup.stop }}
        </button>
        <button
          type="button"
          class="btn btn-outline-primary"
          :disabled="busy"
          data-testid="cup-next"
          @click="run(() => endpoints.barCupNext())"
        >
          {{ t.bar.cup.next }}
        </button>
      </div>
    </section>
    <section
      v-if="local?.result"
      :class="['dt-bar-result', local.result === 'lose' ? 'is-bad' : 'is-ok']"
      data-testid="cup-result"
    >
      <b>{{ resultHead(local) }}</b>
      <div v-if="local.awards.length > 0" class="dt-award-chips" data-testid="cup-award">
        <AwardChip v-for="(a, i) in local.awards" :key="i" :award="a" />
      </div>
      <button
        type="button"
        class="btn btn-outline-primary dt-btn-block"
        data-testid="cup-again"
        @click="again"
      >
        {{ t.bar.again }}
      </button>
    </section>
  </div>
</template>
