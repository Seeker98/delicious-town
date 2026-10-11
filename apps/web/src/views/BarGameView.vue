<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { BarDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtEmpty from '../components/DtEmpty.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import CupPanel from '../components/bar/CupPanel.vue';
import DartsPanel from '../components/bar/DartsPanel.vue';
import DealPanel from '../components/bar/DealPanel.vue';
import DevilPanel from '../components/bar/DevilPanel.vue';
import FgPanel from '../components/bar/FgPanel.vue';
import MemoryPanel from '../components/bar/MemoryPanel.vue';
import NimPanel from '../components/bar/NimPanel.vue';
import NumPanel from '../components/bar/NumPanel.vue';
import SlotPanel from '../components/bar/SlotPanel.vue';
import SpicePanel from '../components/bar/SpicePanel.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { usePageChip } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';
import type { BarGame } from '../utils/barGames';
import { formatNum } from '../utils/format';

/**
 * 酒吧的一个游戏（界面改版 P9）：每个游戏单独一页，返回回到酒吧首页。
 * 顶栏右边是这个游戏花的东西的余额（老虎机是蟹币、一掷千金是银币，其余是神秘礼券）
 */
const props = defineProps<{ game: BarGame }>();
const toast = useToastStore();
const t = useT();
const data = ref<BarDto | null>(null);
const failed = ref(false);

async function load() {
  try {
    data.value = await endpoints.bar();
    failed.value = false;
  } catch (e) {
    failed.value = true;
    toast.push(errorMessage(e, t.value.bar.loadFailed), 'danger');
  }
}
onMounted(load);

usePageChip(() => {
  const d = data.value;
  if (!d) return null;
  const c = t.value.bar.chips;
  if (props.game === 'slot')
    return { art: 'res-krab', text: formatNum(d.krabCoins), label: `${c.krab} ${formatNum(d.krabCoins)}` };
  if (props.game === 'deal')
    return { art: 'res-coin-silver', text: formatNum(d.coin), label: c.coinLabel(formatNum(d.coin)) };
  return { art: 'res-voucher', text: formatNum(d.tickets), label: `${c.tickets} ${formatNum(d.tickets)}` };
});
</script>

<template>
  <DtEmpty v-if="!data && failed" :title="t.bar.loadFailed" data-testid="bar-failed" />
  <DtSkeleton v-else-if="!data" :rows="4" />
  <template v-else>
    <FgPanel v-if="game === 'fg'" :data="data" @reload="load" />
    <CupPanel v-else-if="game === 'cup'" :data="data" @reload="load" />
    <NumPanel v-else-if="game === 'num'" :data="data" @reload="load" />
    <SlotPanel v-else-if="game === 'slot'" :data="data" @reload="load" />
    <DevilPanel v-else-if="game === 'devil'" :data="data" @reload="load" />
    <MemoryPanel v-else-if="game === 'memory'" :data="data" @reload="load" />
    <DartsPanel v-else-if="game === 'darts'" :data="data" @reload="load" />
    <NimPanel v-else-if="game === 'nim'" :data="data" @reload="load" />
    <SpicePanel v-else-if="game === 'spice'" :data="data" @reload="load" />
    <DealPanel v-else :data="data" @reload="load" />
  </template>
</template>
