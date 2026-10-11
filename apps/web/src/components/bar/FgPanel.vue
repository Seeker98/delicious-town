<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BarDto, FgResultDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import type { ArtName } from '../../art/generated/names';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';
import AwardChip from './AwardChip.vue';
import BarInfo from './BarInfo.vue';
import { handName } from './award';

/**
 * 划拳（界面改版 P9）：上面你和调酒师出的拳放大对着，下面结果卡，再下面三个出拳大按钮。
 * 不限局数，每局 1 张神秘礼券
 */
const props = defineProps<{ data: BarDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const hand = ref(0);
const last = ref<FgResultDto | null>(null);
/** 0 石头、1 剪刀、2 布 */
const HAND_ART: readonly ArtName[] = ['game-rock', 'game-scissors', 'game-paper'];

const block = computed(() => (props.data.tickets < 1 ? t.value.bar.fg.noTickets : ''));
const streak = computed(() => (props.data.fg.result === 'win' ? props.data.fg.times : 0));
const sub = computed(() => (streak.value > 0 ? t.value.bar.fg.subStreak(streak.value) : t.value.bar.fg.sub));
const headline = computed(() => {
  const r = last.value;
  if (!r) return '';
  const f = t.value.bar.fg;
  if (r.result === 'draw') return f.drawHead(formatNum(r.coin));
  if (r.result === 'lose') return f.loseHead;
  return f.winHead(r.lucky, r.times);
});

async function play(h: number) {
  if (busy.value || block.value) return;
  busy.value = true;
  try {
    const r = await endpoints.barFg(h);
    hand.value = h;
    last.value = r;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.bar.fg.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BarInfo game="fg" :title="t.bar.fg.title" :sub="sub" />
  <section class="dt-card dt-bar-stage">
    <div class="dt-fg-vs">
      <div>
        <span class="dt-fg-hand is-me"
          ><DtArt v-if="last" :name="HAND_ART[hand]!" :size="64" /><b v-else aria-hidden="true">?</b></span
        >
        <b data-testid="fg-me">{{ last ? t.bar.fg.side(t.bar.fg.me, handName(hand)) : t.bar.fg.me }}</b>
      </div>
      <b class="dt-fg-vs-mid" aria-hidden="true">VS</b>
      <div>
        <span class="dt-fg-hand"
          ><DtArt v-if="last" :name="HAND_ART[last.barHand]!" :size="64" /><b v-else aria-hidden="true"
            >?</b
          ></span
        >
        <b data-testid="fg-bar">{{
          last ? t.bar.fg.side(t.bar.fg.bartender, handName(last.barHand)) : t.bar.fg.bartender
        }}</b>
      </div>
    </div>
  </section>
  <section
    v-if="last"
    :key="`${last.result}-${last.times}-${hand}`"
    :class="['dt-bar-result', last.result === 'win' ? 'is-ok' : last.result === 'lose' ? 'is-bad' : '']"
    role="status"
    data-testid="fg-result"
  >
    <b>{{ headline }}</b>
    <div v-if="last.award" class="dt-award-chips"><AwardChip :award="last.award" /></div>
  </section>
  <p class="dt-bar-label">{{ t.bar.fg.pick }}</p>
  <div class="dt-fg-hands">
    <button
      v-for="(h, i) in t.bar.hands"
      :key="i"
      type="button"
      class="dt-fg-btn"
      :data-testid="`fg-${i}`"
      :disabled="busy || !!block"
      @click="play(i)"
    >
      <DtArt :name="HAND_ART[i]!" :size="52" />{{ h }}
    </button>
  </div>
  <div v-if="block" class="dt-bar-block" data-testid="block">{{ block }}</div>
</template>
