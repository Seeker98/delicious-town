<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TakeawayDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtArt from '../DtArt.vue';

const props = defineProps<{ data: TakeawayDto }>();
const emit = defineEmits<{ reload: [] }>();
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const o = computed(() => props.data.open);
/** 开通条件三条（界面改版 P8）：逐条打勾或打叉 */
const checks = computed(() => {
  const x = t.value.takeaway.open;
  const d = props.data;
  return [
    {
      key: 'star',
      ok: d.star >= o.value.needStar,
      text: x.starNeed(o.value.needStar),
      sub: x.nowStar(d.star),
    },
    {
      key: 'renown',
      ok: d.renown >= o.value.needRenown,
      text: x.renownNeed(formatNum(o.value.needRenown)),
      sub: x.nowNum(formatNum(d.renown)),
    },
    {
      key: 'cost',
      ok: o.value.tickets > 0 || (d.coin >= o.value.needCoin && d.diamond >= o.value.needDiamond),
      text: x.cost(formatNum(o.value.needCoin), o.value.needDiamond),
      sub: x.have(o.value.tickets, formatNum(d.coin), formatNum(d.diamond)),
    },
  ];
});

/** 两种方式都要满足的条件 */
const common = computed(() => {
  const x = t.value.takeaway.open;
  if (props.data.star < o.value.needStar) return x.needStar(o.value.needStar);
  if (props.data.renown < o.value.needRenown) return x.noRenown(formatNum(o.value.needRenown));
  return '';
});
const blockTicket = computed(
  () => common.value || (o.value.tickets < 1 ? t.value.takeaway.open.noTicket : ''),
);
const blockCoin = computed(() => {
  if (common.value) return common.value;
  if (props.data.coin < o.value.needCoin) return t.value.takeaway.noCoin(formatNum(o.value.needCoin));
  if (props.data.diamond < o.value.needDiamond) return t.value.takeaway.noDiamond(o.value.needDiamond);
  return '';
});

async function open(way: 'ticket' | 'coin') {
  if (busy.value || (way === 'ticket' ? blockTicket.value : blockCoin.value)) return;
  busy.value = true;
  try {
    await endpoints.takeawayOpen(way);
    toast.push(t.value.takeaway.open.done);
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.takeaway.open.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div data-testid="takeaway-open">
    <section class="dt-card dt-ta-intro">
      <span class="dt-ta-intro-art"><DtArt name="place-takeaway" :size="44" /></span>
      <p>{{ t.takeaway.open.intro }}</p>
    </section>
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.takeaway.open.needsTitle }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <div v-for="c in checks" :key="c.key" class="dt-row dt-row-wrap" :data-testid="`need-${c.key}`">
          <span :class="['dt-check', c.ok ? 'is-ok' : 'is-no']" aria-hidden="true"
            ><i :class="['bi', c.ok ? 'bi-check-lg' : 'bi-x-lg']"></i
          ></span>
          <span class="dt-row-main">
            <span class="dt-row-title">{{ c.text }}</span>
            <span class="dt-row-sub">{{ c.sub }}</span>
          </span>
          <span class="visually-hidden">{{ c.ok ? t.takeaway.open.met : t.takeaway.open.unmet }}</span>
        </div>
      </div>
    </section>
    <div class="dt-ta-open-btns">
      <button
        type="button"
        class="btn btn-primary dt-btn-block"
        data-testid="open-ticket"
        :disabled="busy || !!blockTicket"
        @click="open('ticket')"
      >
        {{ t.takeaway.open.byTicket(o.tickets) }}
      </button>
      <div v-if="blockTicket" class="dt-ta-why" data-testid="block-ticket">{{ blockTicket }}</div>
      <button
        type="button"
        class="btn btn-light dt-btn-block"
        data-testid="open-coin"
        :disabled="busy || !!blockCoin"
        @click="open('coin')"
      >
        {{ t.takeaway.open.byCoin }}
      </button>
      <div v-if="blockCoin && blockCoin !== blockTicket" class="dt-ta-why" data-testid="block-coin">
        {{ blockCoin }}
      </div>
    </div>
  </div>
</template>
