<script setup lang="ts">
import { formatNum } from '../../utils/format';
import { computed, ref } from 'vue';
import type { DuelResultDto, TowerDto, TowerFloorDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import DtSheet from '../DtSheet.vue';
import DtStatTile from '../DtStatTile.vue';
import DuelResult from './DuelResult.vue';
import DuelRules from './DuelRules.vue';
import ElderGear from './ElderGear.vue';

/**
 * 厨塔挑战（界面改版 P9）：上面今日次数、挑战券、体力；十层一层一行（层号、守护者、厨力、今天剩几次），
 * 右边“挑战”；点整行弹出这一层的面板（台词、双方厨力、今日特色菜、长老装备、试打和挑战）。
 * 对决结果从下面弹出
 */
const props = defineProps<{ data: TowerDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
/** 守塔人店名、称号、台词按目录取当前语言（问题记录 272）；目录里没有时用服务端给的原文 */
const floorText = (f: { floor: number; name: string; title: string; note: string }) => {
  const x = catalog.data('tower', f.floor);
  return { name: x?.name ?? f.name, title: x?.title ?? f.title, note: x?.note ?? f.note };
};
const toast = useToastStore();
const t = useT();
const busy = ref(false);
const last = ref<DuelResultDto | null>(null);
/** 最近一局打的是哪一层：结果里对手写这一层的译名 */
const lastFloor = ref<TowerFloorDto | null>(null);
/** 点开的那一层 */
const openNo = ref<number | null>(null);
const opened = computed(() => props.data.floors.find((f) => f.floor === openNo.value) ?? null);
const resultOpen = ref(false);

/** 不能挑战（test = 试打）的原因；空串表示可以 */
function blockOf(f: TowerFloorDto, test: boolean): string {
  const d = props.data;
  const x = t.value.tower.floor;
  if (!f.unlocked) return d.level < f.minLevel ? x.needLevel(f.minLevel) : x.needPrev(f.floor - 1);
  if (f.floor > d.nightFloor && d.hour < d.openHour) return x.night(d.nightFloor + 1, d.openHour);
  if (!test && d.left <= 0) return t.value.tower.noMoreToday;
  if (!test && f.left <= 0) return x.tired;
  const cost = test ? d.testCost : f.cost;
  if (d.strength < cost) return t.value.tower.noStrength(cost);
  return '';
}
/** 一行的副行：厨力、今天还能挑战这位守护者几次；挑不了的写原因（红字） */
const lockText = (f: TowerFloorDto) => {
  const why = blockOf(f, false);
  return why && why !== t.value.tower.floor.tired ? why : '';
};

async function go(f: TowerFloorDto, test: boolean) {
  if (busy.value || blockOf(f, test)) return;
  busy.value = true;
  try {
    last.value = await endpoints.towerChallenge(f.floor, test);
    lastFloor.value = f;
    openNo.value = null;
    resultOpen.value = true;
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, t.value.tower.challengeFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-tiles-3" data-testid="tower-head">
    <DtStatTile :value="t.tower.floor.leftOf(data.left, data.dailyTotal)" :label="t.tower.floor.leftLabel" />
    <DtStatTile :value="formatNum(data.tickets)" :label="t.tower.floor.ticketsLabel" />
    <DtStatTile :value="formatNum(data.strength)" :label="t.tower.floor.strengthLabel" />
  </div>
  <p class="dt-block-note mt-2">{{ t.tower.floor.ticketNote }}</p>
  <DuelRules :judge-count="data.duelJudges" :weights="data.duelWeights" />
  <div class="dt-block-head">
    <h2 class="dt-block-title">{{ t.tower.floor.listTitle }}</h2>
    <span class="dt-block-more">{{ t.tower.floor.listTap }}</span>
  </div>
  <div class="dt-card dt-rows-card">
    <div
      v-for="f in data.floors"
      :key="f.floor"
      :class="['dt-row', 'dt-row-wrap', 'dt-floor-row', { 'is-off': !f.unlocked }]"
      :data-testid="`floor-${f.floor}`"
    >
      <button
        type="button"
        class="dt-floor-open"
        :data-testid="`floor-open-${f.floor}`"
        @click="openNo = f.floor"
      >
        <span :class="['dt-floor-no', { 'is-off': !f.unlocked }]">{{ f.floor }}</span>
        <span class="dt-row-main">
          <span class="dt-row-title"
            >{{ floorText(f).name
            }}<span :class="['dt-tag', f.unlocked ? 'dt-tag-primary' : 'dt-tag-mute']">{{
              floorText(f).title
            }}</span></span
          >
          <span class="dt-row-sub"
            >{{ t.tower.floor.power(f.power) }} ·
            <span v-if="lockText(f)" class="text-danger" :data-testid="`block-${f.floor}`">{{
              lockText(f)
            }}</span
            ><template v-else>{{ t.tower.floor.leftToday(f.left, f.maxTimes) }}</template></span
          >
        </span>
      </button>
      <span v-if="f.unlocked && f.left <= 0" class="dt-tag-mute">{{ t.tower.floor.tiredTag }}</span>
      <button
        v-else-if="f.unlocked"
        type="button"
        class="btn btn-sm btn-outline-primary"
        :data-testid="`tc-${f.floor}`"
        :disabled="busy || !!blockOf(f, false)"
        @click="go(f, false)"
      >
        {{ t.tower.challenge }}
      </button>
    </div>
  </div>

  <DtSheet
    :open="opened !== null"
    :title="opened ? t.tower.floor.name(opened.floor, floorText(opened).name) : ''"
    @close="openNo = null"
  >
    <template v-if="opened">
      <div class="dt-detail-head">
        <span class="dt-floor-no is-big">{{ opened.floor }}</span>
        <div class="dt-detail-info">
          <span class="dt-tag dt-tag-primary">{{ floorText(opened).title }}</span>
          <div class="dt-detail-sub">{{ t.tower.floor.quote(floorText(opened).note) }}</div>
        </div>
      </div>
      <div class="dt-duel-vs mt-3">
        <div>
          <span>{{ t.tower.floor.myPower }}</span
          ><b>{{ data.power }}</b>
        </div>
        <span class="dt-duel-vs-mid" aria-hidden="true">VS</span>
        <div>
          <span>{{ t.tower.floor.hisPower }}</span
          ><b>{{ opened.power }}</b>
        </div>
      </div>
      <dl class="dt-sum">
        <div>
          <dt>{{ t.tower.floor.leftHim(floorText(opened).name) }}</dt>
          <dd>{{ t.tower.floor.times(opened.left, opened.maxTimes) }}</dd>
        </div>
        <div v-if="opened.mc">
          <dt>{{ t.tower.floor.mcLabel }}</dt>
          <dd>{{ t.tower.floor.mcValue(catalog.mcName(opened.mc.mcId), opened.mc.price) }}</dd>
        </div>
        <div>
          <dt>{{ t.tower.floor.needLabel }}</dt>
          <dd>{{ t.tower.floor.needValue(opened.minLevel) }}</dd>
        </div>
      </dl>
      <ElderGear :elder="opened.elder" />
      <p class="dt-detail-note">{{ t.tower.floor.testNote }}</p>
      <div
        v-if="blockOf(opened, false)"
        class="dt-detail-note text-danger"
        :data-testid="`sheet-block-${opened.floor}`"
      >
        {{ blockOf(opened, false) }}
      </div>
    </template>
    <template v-if="opened" #actions>
      <div class="dt-sheet-pair">
        <button
          type="button"
          class="btn btn-outline-primary"
          :data-testid="`tp-${opened.floor}`"
          :disabled="busy || !!blockOf(opened, true)"
          @click="go(opened, true)"
        >
          {{ t.tower.floor.test(data.testCost) }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :data-testid="`tc-sheet-${opened.floor}`"
          :disabled="busy || !!blockOf(opened, false)"
          @click="go(opened, false)"
        >
          {{ t.tower.floor.go(opened.cost) }}
        </button>
      </div>
    </template>
  </DtSheet>

  <DtSheet :open="resultOpen && !!last" :title="t.tower.duel.resultTitle" @close="resultOpen = false">
    <DuelResult v-if="last" :result="last" :them-name="lastFloor ? floorText(lastFloor).name : undefined" />
    <template #actions>
      <button
        type="button"
        class="btn btn-light dt-btn-block"
        data-testid="duel-close"
        @click="resultOpen = false"
      >
        {{ t.tower.duel.ok }}
      </button>
    </template>
  </DtSheet>
</template>
