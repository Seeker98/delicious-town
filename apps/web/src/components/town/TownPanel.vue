<script setup lang="ts">
import { computed, ref } from 'vue';
import { HIPHOP_PLACE_NAMES, HIPHOP_PLACES, type HiphopPlace } from '@dt/shared';
import type { NpcKey, TownDto, TownRewardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { effectChips } from '../../utils/effects';
import { formatNum } from '../../utils/format';
import { rewardText } from '../../utils/rewards';
import { useServerClock } from '../../utils/serverClock';

const props = defineProps<{ data: TownDto }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const busy = ref(false);
const clock = useServerClock(() => props.data.now);

const NPCS: Array<{ key: NpcKey; name: string; desc: string }> = [
  { key: 'bigEater', name: '大胃哥', desc: '每天送 1~5 级食材和一颗种子' },
  { key: 'wenjie', name: '雯姐', desc: '每天送神秘礼券' },
  { key: 'bro13', name: '13 哥', desc: '每天送喇叭' },
];
const TYPES = [
  { type: 1, label: '晴类' },
  { type: 2, label: '雨类' },
  { type: 3, label: '雪冰类' },
  { type: 4, label: '风沙雾类' },
];

async function act<T>(fn: () => Promise<T>, done: (r: T) => string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(done(await fn()), 'success');
    emit('reload');
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    // 失败多半是页面已经过时（别人刚许过愿、跨天等）：重新读一次
    emit('reload');
  } finally {
    busy.value = false;
  }
}
const rewards = (list: TownRewardDto[]) => list.map((r) => rewardText(r, catalog)).join('、');

const mayorOpen = ref(false);
const PLACES = HIPHOP_PLACES.map((p) => ({ id: p, name: HIPHOP_PLACE_NAMES[p] }));
function askMayor(place: HiphopPlace) {
  void act(
    () => endpoints.townMayor(place),
    (r) => `镇长：${r.talk} 获得 ${rewards(r.rewards)}`,
    '回答失败',
  );
}

function talk(key: NpcKey, name: string) {
  void act(
    () => endpoints.townTalk(key),
    (r) => `${name}：${r.talk} 获得 ${rewards(r.rewards)}`,
    '聊天失败',
  );
}
function shake() {
  void act(
    () => endpoints.townShake(),
    (r) =>
      `摇到银币 ${formatNum(r.coin)}` +
      (r.egg ? `，还从裤兜里掏出了 ${catalog.goodsName(r.egg.goodsId)}×${r.egg.num}` : ''),
    '摇钱包失败',
  );
}

const bless = computed(() => props.data.bless.today);
const pick = ref('');
const blessFoods = computed(() => {
  const b = bless.value;
  if (!b || !b.levels) return [];
  const [lo, hi] = b.levels;
  return [...catalog.foodsMap.values()].filter((f) => f.level >= lo && f.level <= hi);
});
const blessReward = computed(() => {
  const b = bless.value;
  if (!b) return '';
  const lv = b.levels
    ? b.levels[0] === b.levels[1]
      ? `${b.levels[0]}`
      : `${b.levels[0]}~${b.levels[1]}`
    : '';
  const base =
    b.type === 5
      ? `${lv} 级随机食材 ${b.num} 种`
      : b.type === 0
        ? `自选 ${lv} 级食材 ×${b.num}`
        : b.type === 2
          ? `${catalog.goodsName(b.goodsId!)}×${b.num}`
          : b.type === 3
            ? `银币 ${formatNum(b.num)}`
            : `钻石 ${b.num}`;
  if (!props.data.bless.hasLamp) return base;
  return base + (b.type === 3 ? '（持有神灯多领 10%）' : '（持有神灯多领一份）');
});
const feastBlock = computed(() => {
  const b = bless.value;
  if (!b) return '';
  if (props.data.bless.feasted) return '今天已经领过了';
  if (props.data.bless.activation < b.needAct)
    return `今天活跃度 ${props.data.bless.activation}，要 ${b.needAct} 才能领`;
  return '';
});
function feast() {
  const foodsId = bless.value?.type === 0 ? Number(pick.value) : undefined;
  void act(
    () => endpoints.townFeast(foodsId),
    (r) => `共飨获得 ${rewards(r.rewards)}`,
    '共飨失败',
  );
}
function wish() {
  void act(
    () => endpoints.townWish(),
    (r) => `许愿得到星愿：${r.bless.name}`,
    '许愿失败',
  );
}

const hammerBlock = computed(() => {
  const h = props.data.hammer;
  if (!h.has) return '持有雷神锤才能使用';
  if (clock.pending(h.readyAt))
    return `冷却到 ${new Date(h.readyAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  if (clock.pending(h.townReadyAt)) return `刚换过天气，${clock.secondsLeft(h.townReadyAt)} 秒后才能再换`;
  return '';
});
function hammer(body: { mode: 'coin'; type: number } | { mode: 'diamond' }) {
  void act(
    () => endpoints.townHammer(body),
    (r) =>
      `${catalog.weatherName(r.from)}转${catalog.weatherName(r.to)}了，获得 ${catalog.goodsName(r.gift.goodsId)}×${r.gift.num}`,
    '换天气失败',
  );
}
</script>

<template>
  <h6 class="dt-section">NPC</h6>
  <div v-for="n in NPCS" :key="n.key" class="dt-item">
    <div class="dt-item-main">
      <div class="dt-item-title">{{ n.name }}</div>
      <div class="dt-meta">{{ n.desc }}</div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || data.talked[n.key]"
        :data-testid="`talk-${n.key}`"
        @click="talk(n.key, n.name)"
      >
        {{ data.talked[n.key] ? '今天聊过了' : '聊天' }}
      </button>
    </div>
  </div>
  <div class="dt-item">
    <div class="dt-item-main">
      <div class="dt-item-title">镇长</div>
      <div class="dt-meta">
        {{
          data.mayor.answered ? '今天已经告诉过镇长了' : '告诉镇长嘻哈男孩今天在哪：答对有加成，答错要挨批'
        }}
      </div>
    </div>
    <div v-if="!data.mayor.answered" class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy"
        data-testid="mayor-open"
        @click="mayorOpen = !mayorOpen"
      >
        告诉镇长
      </button>
    </div>
  </div>
  <div v-if="mayorOpen && !data.mayor.answered" class="dt-pick-grid mb-2">
    <button
      v-for="p in PLACES"
      :key="p.id"
      class="btn btn-sm btn-outline-secondary"
      :disabled="busy"
      :data-testid="`mayor-${p.id}`"
      @click="askMayor(p.id)"
    >
      {{ p.name }}
    </button>
  </div>

  <h6 class="dt-section">蟹老板的钱袋</h6>
  <div class="dt-item">
    <div class="dt-item-main">
      <div class="dt-meta">每天可以摇一次，摇到的银币和星级有关</div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || data.shaken"
        data-testid="shake"
        @click="shake"
      >
        {{ data.shaken ? '今天摇过了' : '摇一摇' }}
      </button>
    </div>
  </div>

  <h6 class="dt-section">星愿</h6>
  <div v-if="bless" class="dt-card small">
    <div>
      <b data-testid="bless-name">{{ bless.name }}</b>
      <span class="dt-meta ms-1">{{ data.bless.restName }} 许的愿，今天全镇生效</span>
    </div>
    <div class="d-flex flex-wrap gap-1 my-1">
      <span
        v-for="c in effectChips(bless.buff)"
        :key="c.text"
        :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
        >{{ c.text }}</span
      >
    </div>
    <div>
      共飨奖励：<span data-testid="bless-reward">{{ blessReward }}</span>
    </div>
    <div class="d-flex flex-wrap gap-1 align-items-center mt-1">
      <select
        v-if="bless.type === 0"
        v-model="pick"
        class="form-select form-select-sm w-auto"
        data-testid="feast-food"
      >
        <option value="">选择食材</option>
        <option v-for="f in blessFoods" :key="f.id" :value="String(f.id)">{{ f.name }}</option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        :disabled="busy || !!feastBlock || (bless.type === 0 && pick === '')"
        data-testid="feast"
        @click="feast"
      >
        共飨
      </button>
      <span v-if="feastBlock" class="text-danger" data-testid="feast-block">{{ feastBlock }}</span>
    </div>
  </div>
  <div v-else class="dt-item">
    <div class="dt-item-main">
      <div class="dt-meta">今天还没有人许愿。第一个许愿的人决定今天全镇的星愿</div>
      <div v-if="!data.bless.hasLamp" class="dt-meta text-danger" data-testid="wish-block">
        持有神灯才能许愿
      </div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !data.bless.hasLamp"
        data-testid="wish"
        @click="wish"
      >
        许愿
      </button>
    </div>
  </div>

  <h6 class="dt-section">雷神锤</h6>
  <div class="dt-card small">
    <div class="mb-1">
      当前天气：<b>{{ data.weather.name }}</b>
      <div class="dt-meta">
        换成某一类天气：每次 {{ formatNum(data.hammer.coin) }} 银币；召唤特殊天气：每次
        {{ data.hammer.diamond }} 钻石
      </div>
    </div>
    <div class="dt-grid2">
      <button
        v-for="x in TYPES"
        :key="x.type"
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || !!hammerBlock"
        :data-testid="`hammer-${x.type}`"
        @click="hammer({ mode: 'coin', type: x.type })"
      >
        {{ x.label }}
      </button>
      <button
        class="btn btn-sm btn-outline-warning dt-span2"
        :disabled="busy || !!hammerBlock"
        data-testid="hammer-diamond"
        @click="hammer({ mode: 'diamond' })"
      >
        召唤特殊天气
      </button>
    </div>
    <div v-if="hammerBlock" class="text-danger mt-1" data-testid="hammer-block">{{ hammerBlock }}</div>
  </div>
</template>
