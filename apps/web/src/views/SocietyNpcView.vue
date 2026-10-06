<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { TownDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import NpcCard, { type NpcCardKey } from '../components/NpcCard.vue';
import ClassroomPanel from '../components/town/ClassroomPanel.vue';
import ExchangePanel from '../components/town/ExchangePanel.vue';
import FundPanel from '../components/town/FundPanel.vue';
import MayorAsk from '../components/town/MayorAsk.vue';
import NpcTalk from '../components/town/NpcTalk.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';

/**
 * 协会里从广场搬过来的几项（问题记录 441、443）：教室；兑换拆给三位 NPC——镇长大胃锅（稀有道具，
 * 带着“嘻哈男孩在哪”的问答）、13 哥（食材兑换券，带着每天聊天）、卡门（神秘食材兑换券）；发展基金归盖乐瑞
 */
export type SocietyNpc = 'classroom' | 'mayor' | 'bro13' | 'carmen' | 'fund';
const props = defineProps<{ npc: SocietyNpc }>();
const t = useT();
const toast = useToastStore();
const restaurant = useRestaurantStore();

/** 每项要的区服功能；页面上的 NPC */
const FEATURE: Record<SocietyNpc, string> = {
  classroom: 'mysterious',
  mayor: 'town',
  bro13: 'town',
  carmen: 'town',
  fund: 'fund',
};
const CARD: Partial<Record<SocietyNpc, NpcCardKey>> = {
  mayor: 'mayor',
  bro13: 'bro13',
  carmen: 'carmen',
  fund: 'gary',
};

/** 直接从链接进来时还没有餐厅数据：先读一次，才知道区服关没关这一项（不然先弹“功能关闭”，backlog ①a） */
const restFailed = ref(false);
function loadRest() {
  restFailed.value = false;
  restaurant.refresh().catch(() => {
    restFailed.value = true;
  });
}
const ready = computed(() => restaurant.rest !== null);
const on = computed(() => restaurant.featureOn(FEATURE[props.npc]));

/** 镇长的问答、13 哥的聊天要广场的数据 */
const town = ref<TownDto | null>(null);
async function loadTown() {
  try {
    town.value = await endpoints.town();
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.loadFailed), 'danger');
  }
}
const needTown = computed(() => props.npc === 'mayor' || props.npc === 'bro13');
watch(
  () => ready.value && on.value && needTown.value,
  (go) => {
    if (go) void loadTown();
  },
  { immediate: true },
);
onMounted(() => {
  if (!restaurant.rest) loadRest();
});
</script>

<template>
  <div>
    <RouterLink to="/society" class="small">‹ {{ t.society.title }}</RouterLink>
    <h5 class="mt-1">{{ t.npc.titles[npc] }}</h5>
    <NpcCard v-if="CARD[npc]" :npc="CARD[npc]!" />
    <div v-if="restFailed" class="small text-muted" data-testid="npc-rest-failed">
      {{ t.town.restFailed }}
      <button class="btn btn-sm btn-link p-0 align-baseline" data-testid="npc-rest-retry" @click="loadRest">
        {{ t.town.retry }}
      </button>
    </div>
    <template v-else-if="ready">
      <div v-if="!on" class="dt-empty" data-testid="npc-off">{{ t.npc.off }}</div>
      <ClassroomPanel v-else-if="npc === 'classroom'" />
      <template v-else-if="npc === 'mayor'">
        <MayorAsk v-if="town" :data="town" @reload="loadTown" />
        <ExchangePanel part="goods" />
      </template>
      <template v-else-if="npc === 'bro13'">
        <NpcTalk v-if="town" :data="town" npc="bro13" @reload="loadTown" />
        <h6 class="dt-section">{{ t.town.exchange.tickets }}</h6>
        <ExchangePanel part="level" />
      </template>
      <ExchangePanel v-else-if="npc === 'carmen'" part="mystery" />
      <FundPanel v-else-if="npc === 'fund'" />
    </template>
  </div>
</template>
