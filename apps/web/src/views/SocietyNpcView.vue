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

/** 镇长大胃锅的聊天和问答、13 哥的聊天、卡门的见面礼要广场的数据（聊过没有、领过没有） */
const town = ref<TownDto | null>(null);
const townFailed = ref(false);
/** 读取序号：几次读取同时进行时只采用最新一次的结果（问答后的重读和 15 秒后的重读可能重叠） */
let seq = 0;
async function loadTown() {
  const mine = ++seq;
  townFailed.value = false;
  try {
    const v = await endpoints.town();
    if (mine === seq) town.value = v;
  } catch (e) {
    if (mine !== seq) return;
    townFailed.value = true;
    toast.push(errorMessage(e, t.value.town.loadFailed), 'danger');
  }
}
const needTown = computed(() => props.npc !== 'classroom' && props.npc !== 'fund');
watch(
  () => [ready.value && on.value && needTown.value, props.npc] as const,
  ([go]) => {
    // 在两个 NPC 页之间直接切换（前进后退）时组件会复用：换页就丢掉上一页的数据重读
    town.value = null;
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
    <RouterLink to="/society" class="small dt-back">{{ t.society.title }}</RouterLink>
    <h5 class="mt-1">{{ t.npc.titles[npc] }}</h5>
    <NpcCard v-if="CARD[npc]" :key="npc" :npc="CARD[npc]!" />
    <div v-if="restFailed" class="small text-muted" data-testid="npc-rest-failed">
      {{ t.town.restFailed }}
      <button class="dt-link-btn" data-testid="npc-rest-retry" @click="loadRest">
        {{ t.town.retry }}
      </button>
    </div>
    <template v-else-if="ready">
      <div v-if="!on" class="dt-empty" data-testid="npc-off">{{ t.npc.off }}</div>
      <ClassroomPanel v-else-if="npc === 'classroom'" />
      <FundPanel v-else-if="npc === 'fund'" />
      <template v-else>
        <div v-if="townFailed" class="small text-muted" data-testid="npc-town-failed">
          {{ t.town.loadFailed }}
          <button class="dt-link-btn" data-testid="npc-town-retry" @click="loadTown">
            {{ t.town.retry }}
          </button>
        </div>
        <template v-if="npc === 'mayor'">
          <!-- 原来广场的大胃哥（问题记录 441：游戏里只有大胃锅，就是镇长），每天聊天送食材和种子 -->
          <template v-if="town">
            <NpcTalk :talked="town.talked.bigEater" npc="bigEater" @reload="loadTown" />
            <MayorAsk :data="town" @reload="loadTown" />
          </template>
          <ExchangePanel part="goods" />
          <!-- 原来同一页里的兑换券分给了 13 哥和卡门 -->
          <p class="small text-muted mt-2" data-testid="mayor-tickets-hint">
            {{ t.npc.ticketsHint }}
            <RouterLink to="/society/bro13">{{ t.npc.bro13.name }}</RouterLink>
            ·
            <RouterLink to="/society/carmen">{{ t.npc.carmen.name }}</RouterLink>
          </p>
        </template>
        <template v-else-if="npc === 'bro13'">
          <NpcTalk v-if="town" :talked="town.talked.bro13" npc="bro13" @reload="loadTown" />
          <h6 class="dt-section">{{ t.town.exchange.tickets }}</h6>
          <ExchangePanel part="level" />
        </template>
        <template v-else-if="npc === 'carmen'">
          <!-- 见面礼：原来大胃哥第一次聊天送的神秘食材兑换券（问题记录 441），领过就不再显示 -->
          <NpcTalk
            v-if="town && !town.bigEaterGift"
            :talked="town.talked.carmen"
            npc="carmen"
            @reload="loadTown"
          />
          <ExchangePanel part="mystery" />
        </template>
      </template>
    </template>
  </div>
</template>
