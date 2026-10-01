<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { DeviceOptionsDto, DineCurrentDto, EffectDto, TaskDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import HomeNews from '../components/town/HomeNews.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';
import { effectChips } from '../utils/effects';
import { formatNum } from '../utils/format';
import { CUSTOMER_NAMES } from '../utils/labels';

const store = useRestaurantStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rest = computed(() => store.rest);
const error = ref('');
const busy = ref(false);
const mainTask = ref<TaskDto | null>(null);
const dining = ref<DineCurrentDto | null>(null);
const options = ref<DeviceOptionsDto | null>(null);
const pickingSlot = ref<number | null>(null);

async function load() {
  try {
    await store.refresh();
    mainTask.value = (await endpoints.tasks()).main;
    dining.value = await endpoints.dineCurrent();
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, '获取餐厅信息失败');
  }
}

async function act(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);
/** 银币不够加满时有多少加多少（服务端同样处理） */
const refuelNeed = computed(() => (rest.value ? rest.value.oilMax - rest.value.oil : 0));
const refuelCost = computed(() => (rest.value ? Math.min(refuelNeed.value, rest.value.coin) : 0));
const customers = computed(() =>
  Object.entries(rest.value?.lastRound?.customers ?? {})
    .filter(([k]) => k !== '0')
    .map(([k, v]) => `${CUSTOMER_NAMES[k] ?? k}×${v}`)
    .join('，'),
);

async function openSlot(slot: number) {
  pickingSlot.value = slot;
  try {
    options.value = await endpoints.devices();
  } catch (e) {
    toast.push(errorMessage(e, '读取设施失败'), 'danger');
  }
}
const choices = computed(() => {
  const slot = options.value?.slots.find((s) => s.slot === pickingSlot.value);
  if (!slot || !options.value) return [];
  return options.value.store.filter((x) => x.deviceType === slot.deviceType);
});
function place(goodsId: number) {
  const slot = pickingSlot.value!;
  pickingSlot.value = null;
  // 替换还没到期的设施：旧设施直接作废、不退还，先让玩家确认
  const current = rest.value?.devices.find((d) => d.slot === slot);
  if (
    current?.goodsId &&
    (current.expiresAt === null || new Date(current.expiresAt).getTime() > Date.now()) &&
    !window.confirm(
      `${catalog.goodsName(current.goodsId)}还没到期（${expiresText(current.expiresAt)}），替换后不会退还，确定替换吗？`,
    )
  )
    return;
  return act(() => endpoints.placeDevice(slot, goodsId), '摆放失败');
}

/** 第二块牌匾位（设施位 7）：满星级后还要花银币和钻石开通 */
const PLAQUE2_SLOT = 7;
const plaque2Offer = computed(
  () => !!rest.value && !rest.value.plaque2Open && rest.value.starLevel >= rest.value.plaque2Cost.star,
);
const plaque2Block = computed(() => {
  const r = rest.value;
  if (!r) return '';
  if (r.coin < r.plaque2Cost.coin) return `银币不够（要 ${formatNum(r.plaque2Cost.coin)}）`;
  if (r.diamond < r.plaque2Cost.diamond) return `钻石不够（要 ${r.plaque2Cost.diamond}）`;
  return '';
});
/** 锁定文字的星级：第二块牌匾位按区服的开通星级 */
const needStarOf = (d: { slot: number; needStar: number }) =>
  d.slot === PLAQUE2_SLOT && rest.value ? Math.max(d.needStar, rest.value.plaque2Cost.star) : d.needStar;
function openPlaque2() {
  const c = rest.value!.plaque2Cost;
  if (plaque2Block.value) return;
  if (!window.confirm(`花 ${formatNum(c.coin)} 银币和 ${c.diamond} 钻石开通第二块牌匾位吗？`)) return;
  // 花费由全局的得失提示显示
  return act(() => endpoints.openPlaque2(), '开通失败');
}

function expiresText(at: string | null): string {
  if (!at) return '永久';
  const hours = Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000));
  return `剩余 ${hours} 小时`;
}
const effectExpires = (e: EffectDto) => expiresText(e.expiresAt);

const QUICK = [
  { to: '/rest/tasks', icon: 'bi-check2-square', label: '任务' },
  { to: '/rest/equip', icon: 'bi-tools', label: '厨具与加点' },
  { to: '/store', icon: 'bi-archive', label: '仓库' },
  { to: '/shop', icon: 'bi-bag', label: '商店' },
];

/** 生效的加成按来源分组，默认只显示前几条（问题记录：展示凌乱） */
const EFFECTS_SHOWN = 5;
const EFFECT_GROUPS: Array<{ type: string; label: string }> = [
  { type: 'bless', label: '今日星愿' },
  { type: 'street', label: '街道' },
  { type: 'honor', label: '勋章和宠物' },
  { type: 'device', label: '设施' },
  { type: 'equip', label: '厨具' },
  { type: 'suit', label: '套装' },
];
const effectsAll = ref(false);
const effectGroups = computed(() => {
  const all = rest.value?.effects ?? [];
  const known = new Set(EFFECT_GROUPS.map((g) => g.type));
  const ordered = [
    ...EFFECT_GROUPS.map((g) => ({ ...g, items: all.filter((e) => e.sourceType === g.type) })),
    { type: 'other', label: '其他', items: all.filter((e) => !known.has(e.sourceType)) },
  ];
  let left = effectsAll.value ? Infinity : EFFECTS_SHOWN;
  const out: Array<{ type: string; label: string; items: EffectDto[] }> = [];
  for (const g of ordered) {
    if (left <= 0 || g.items.length === 0) continue;
    const items = g.items.slice(0, left);
    left -= items.length;
    out.push({ type: g.type, label: g.label, items });
  }
  return out;
});

let timer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (document.visibilityState === 'visible') void load();
};
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 240_000);
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!rest" class="text-muted">加载中……</div>
  <div v-else>
    <div class="d-flex justify-content-between align-items-center">
      <h5 class="mb-0" data-testid="rest-name">{{ rest.name }}</h5>
      <span class="small">
        <RouterLink to="/weather"><i class="bi bi-cloud-sun"></i> {{ rest.weather?.name ?? '' }}</RouterLink>
        <RouterLink to="/shards" class="ms-2">切换区服</RouterLink>
      </span>
    </div>
    <div v-if="rest.icons.length > 0" class="mb-1" data-testid="my-icons">
      <span v-for="i in rest.icons" :key="i.key" class="badge bg-warning text-dark me-1">{{ i.title }}</span>
    </div>
    <div class="small text-muted mb-2">
      {{ rest.streetName }} · {{ rest.starLevel }} 星 · 等级 <b data-testid="rest-level">{{ rest.level }}</b>
      <span v-if="rest.state === 2" class="badge bg-danger ms-1">停业</span>
    </div>
    <!-- 常用入口（问题记录：原来只有一个孤零零的厨具入口） -->
    <div class="dt-quick mb-2" data-testid="quick-links">
      <RouterLink
        v-for="q in QUICK"
        :key="q.to"
        :to="q.to"
        class="dt-more-link text-center text-decoration-none"
      >
        <i :class="['bi', q.icon, 'd-block']"></i>{{ q.label }}
      </RouterLink>
    </div>

    <div class="row g-1 small">
      <div class="col-6">
        <i class="bi bi-coin"></i> <b data-testid="rest-coin">{{ formatNum(rest.coin) }}</b>
      </div>
      <div class="col-6"><i class="bi bi-gem"></i> {{ formatNum(rest.diamond) }}</div>
      <div class="col-6"><i class="bi bi-lightning"></i> {{ rest.strength }}/{{ rest.strengthMax }}</div>
      <div class="col-6">声望 {{ rest.renown }}</div>
    </div>
    <div
      class="progress my-2 position-relative"
      role="progressbar"
      :aria-valuenow="expPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="progress-bar bg-warning" :style="{ width: `${expPercent}%` }"></div>
      <!-- 数字盖在整条进度条上居中，不跟着橙色部分的宽度走 -->
      <span
        data-testid="exp-text"
        class="position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center small text-dark"
        >{{ formatNum(rest.exp) }}/{{ formatNum(rest.expToNext) }}</span
      >
    </div>
    <div class="d-flex align-items-center gap-2 small">
      <span><i class="bi bi-droplet"></i> 油 {{ formatNum(rest.oil) }}/{{ formatNum(rest.oilMax) }}</span>
      <button
        class="btn btn-sm btn-outline-primary ms-auto"
        data-testid="refuel"
        :disabled="busy || refuelCost <= 0"
        @click="act(() => endpoints.refuel(), '加油失败')"
      >
        {{ refuelCost < refuelNeed ? '加油' : '加满' }}（{{ formatNum(refuelCost) }} 银币）
      </button>
    </div>

    <div v-if="rest.lastRound" class="border rounded p-2 my-2 small" data-testid="last-round">
      <div class="fw-bold mb-1">上一轮收益</div>
      银币 {{ formatNum(rest.lastRound.coin) }} · 经验 {{ formatNum(rest.lastRound.exp) }} · 耗油
      {{ formatNum(rest.lastRound.oil) }}
      <div class="text-muted">{{ customers || '没有客人' }}</div>
      <RouterLink to="/rest/income">收益记录 ›</RouterLink>
      <RouterLink to="/rest/floor" class="ms-3">楼层餐桌 ›</RouterLink>
    </div>

    <div v-if="dining" class="card mb-2" data-testid="dine-card">
      <div class="card-body py-2 d-flex align-items-center small">
        <div class="flex-fill">
          正在 <RouterLink :to="`/friends/${dining.hostRestId}`">{{ dining.hostName }}</RouterLink> 第
          {{ dining.tableNo }} 桌白食，已 {{ dining.minutes }} 分钟
        </div>
        <button
          class="btn btn-sm btn-primary"
          data-testid="dine-end"
          :disabled="busy || !dining.canEnd"
          @click="act(() => endpoints.dineEnd(), '结束白食失败')"
        >
          结束白食
        </button>
      </div>
    </div>
    <div v-if="mainTask" class="dt-card my-2 small">
      <span class="dt-tag me-1">主线</span>{{ mainTask.name }}
      <span class="text-muted"
        >（{{ Math.min(mainTask.progress, mainTask.target) }}/{{ mainTask.target }}）</span
      >
      <button
        v-if="mainTask.done"
        class="btn btn-sm btn-success float-end"
        :disabled="busy"
        @click="act(() => endpoints.claimTask(mainTask!.id), '领取失败')"
      >
        领奖
      </button>
    </div>

    <HomeNews :headlines="rest.headlines" />

    <div v-if="rest.isPlanktonHost" class="alert alert-warning py-2 small" data-testid="plankton">
      <div>
        <b>痞老板赖在店里不走！</b>他带来的勋章在赶走前一直有效：上座率 +50%，但<b>挑剔率 -120%</b>
        （挑剔顾客不来，没人点菜，只能收基础银币），每桌耗油 +5。偶尔他本人坐下吃饭时那一桌收益 ×5。
        赶走后一段时间内他不会再选你的店。
      </div>
      <button
        class="btn btn-sm btn-outline-dark ms-1"
        :disabled="busy"
        @click="act(() => endpoints.drivePlankton('strength'), '赶走失败')"
      >
        花体力赶走
      </button>
      <button
        class="btn btn-sm btn-outline-dark ms-1"
        :disabled="busy"
        @click="act(() => endpoints.drivePlankton('book'), '赶走失败')"
      >
        用蟹黄堡秘方
      </button>
    </div>

    <h6 class="dt-section">设施</h6>
    <div class="row g-1">
      <div v-for="d in rest.devices" :key="d.slot" class="col-3">
        <button
          class="btn btn-light border w-100 h-100 p-1 dt-slot"
          :data-testid="`slot-${d.slot}`"
          :disabled="!d.unlocked || busy"
          @click="openSlot(d.slot)"
        >
          <div class="text-muted text-truncate">{{ d.name }}</div>
          <div v-if="!d.unlocked && d.slot === PLAQUE2_SLOT && plaque2Offer">
            <i class="bi bi-lock"></i> 未开通
          </div>
          <div v-else-if="!d.unlocked"><i class="bi bi-lock"></i> {{ needStarOf(d) }} 星开放</div>
          <div v-else-if="d.goodsId">
            {{ catalog.goodsName(d.goodsId) }}<br /><span class="text-muted">{{
              expiresText(d.expiresAt)
            }}</span>
          </div>
          <div v-else>空</div>
        </button>
      </div>
    </div>
    <div v-if="plaque2Offer" class="dt-item">
      <div class="dt-item-main">
        <div class="dt-item-title">开通第二块牌匾位</div>
        <div class="dt-meta">
          <span data-testid="plaque2-cost"
            >{{ formatNum(rest.plaque2Cost.coin) }} 银币 + {{ rest.plaque2Cost.diamond }} 钻石</span
          >
          <span v-if="plaque2Block" class="text-danger ms-1" data-testid="plaque2-block">{{
            plaque2Block
          }}</span>
        </div>
      </div>
      <div class="dt-item-actions">
        <button
          class="btn btn-sm btn-outline-primary"
          data-testid="open-plaque2"
          :disabled="busy || !!plaque2Block"
          @click="openPlaque2"
        >
          开通
        </button>
      </div>
    </div>
    <div v-if="pickingSlot !== null" class="border rounded p-2 mt-2 small">
      <div class="d-flex justify-content-between">
        <b>选择要摆放的设施</b>
        <a href="#" @click.prevent="pickingSlot = null">取消</a>
      </div>
      <div v-if="choices.length === 0" class="text-muted">仓库里没有能放在这里的设施，可以去商店买。</div>
      <button
        v-for="c in choices"
        :key="c.goodsId"
        class="btn btn-sm btn-outline-primary me-1 mt-1"
        @click="place(c.goodsId)"
      >
        {{ catalog.goodsName(c.goodsId) }}×{{ c.num }}
      </button>
    </div>

    <h6 class="dt-section">经营开关</h6>
    <div class="small">
      <div class="form-check form-switch">
        <input
          id="promo"
          class="form-check-input"
          type="checkbox"
          :checked="rest.promoOn"
          :disabled="busy"
          @change="act(() => endpoints.setPromo(!rest!.promoOn), '设置失败')"
        />
        <label class="form-check-label" for="promo">大促活动（八折促销：上座率大增，收益略降）</label>
      </div>
      <div class="form-check form-switch">
        <input
          id="cte"
          class="form-check-input"
          type="checkbox"
          :checked="rest.cteOn"
          :disabled="busy"
          @change="act(() => endpoints.setCte(!rest!.cteOn), '设置失败')"
        />
        <label class="form-check-label" for="cte">银币转经验（需要阿波罗雕像）</label>
      </div>
      <div v-if="rest.starLevel >= 6" class="d-flex align-items-center gap-2 mt-1">
        挑剔消耗食材档位
        <select
          class="form-select form-select-sm w-auto"
          :value="rest.cookfoodsFlag"
          :disabled="busy"
          @change="
            act(() => endpoints.setCookfoods(Number(($event.target as HTMLSelectElement).value)), '设置失败')
          "
        >
          <option v-for="f in [0, 1, 2, 3, 4, 5]" :key="f" :value="f">
            {{ f === 0 ? '关闭' : `${f} 档` }}
          </option>
        </select>
      </div>
    </div>

    <h6 class="dt-section">生效的加成</h6>
    <div class="small">
      <template v-for="g in effectGroups" :key="g.type">
        <div class="text-muted mt-1" data-testid="effect-group">{{ g.label }}</div>
        <div
          v-for="e in g.items"
          :key="`${e.sourceType}-${e.sourceId}`"
          class="d-flex align-items-center gap-1 border-bottom py-1"
          data-testid="effect-row"
        >
          <GameImg :path="`goods/${e.name}`" :alt="e.name" fallback-icon="bi-award" />
          <b class="text-nowrap">{{ e.name }}</b>
          <span class="flex-fill d-flex flex-wrap gap-1">
            <span
              v-for="c in effectChips(e.effects)"
              :key="c.text"
              :class="['dt-chip', c.good ? 'dt-chip-good' : 'dt-chip-bad']"
              >{{ c.text }}</span
            >
          </span>
          <span class="text-muted text-nowrap">{{ effectExpires(e) }}</span>
        </div>
      </template>
      <a
        v-if="rest.effects.length > EFFECTS_SHOWN"
        href="#"
        class="d-block mt-1"
        data-testid="effects-more"
        @click.prevent="effectsAll = !effectsAll"
        >{{ effectsAll ? '收起' : `展开全部（共 ${rest.effects.length} 条）` }}</a
      >
    </div>
  </div>
</template>
