<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { McOverviewDto, McPreviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, ROAD_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const o = ref<McOverviewDto | null>(null);
const preview = ref<McPreviewDto | null>(null);
const cookie = ref(false);
const qty = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  o.value = await endpoints.mc();
}
async function act(fn: () => Promise<unknown>, ok: string | null, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (ok) toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const dish = (id: number) => catalog.mc(id);
const nameOf = (id: number) => catalog.mcName(id);
/** 填的数超过持有时按持有算 */
const numOf = (mcId: number, max: number) => Math.max(1, Math.min(qty[mcId] ?? 1, max));
const learnedIds = computed(() => new Set(o.value?.learned.map((m) => m.mcId) ?? []));
/** 用残卷学会要 3 张 */
const LEARN_REMNANTS = 3;
/** 等级从高到低，同级按道 */
const byLevel = (a: number, b: number) =>
  (dish(b)?.level ?? 0) - (dish(a)?.level ?? 0) || (dish(a)?.road ?? 0) - (dish(b)?.road ?? 0) || a - b;
/** 按级、按道分页（问题记录 414）：已学和残卷一起筛；选择记在本机，存储不可用时用默认 */
type Tab = 'all' | number;
const FILTER_KEY = 'dt_mc_filter';
const LEVELS = [1, 2, 3, 4, 5, 6] as const;
const ROADS = [1, 2, 3, 4, 5, 6, 7] as const;
function savedFilter(): { level: Tab; road: Tab } {
  try {
    const v = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null') as {
      level?: unknown;
      road?: unknown;
    } | null;
    const ok = (x: unknown, list: readonly number[]): Tab =>
      typeof x === 'number' && list.includes(x) ? x : 'all';
    return { level: ok(v?.level, LEVELS), road: ok(v?.road, ROADS) };
  } catch {
    return { level: 'all', road: 'all' };
  }
}
const saved = savedFilter();
const level = ref<Tab>(saved.level);
const road = ref<Tab>(saved.road);
watch([level, road], ([lv, rd]) => {
  // 换页时收起烹制面板，免得切回来时还开着一个看不见的菜（问题记录 414 审查）
  preview.value = null;
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ level: lv, road: rd }));
  } catch {
    // 存储不可用时忽略
  }
});
const filtering = computed(() => level.value !== 'all' || road.value !== 'all');
// 目录还没读到时不知道等级和道，先全部显示，免得闪一下“这一页没有”
const inLevel = (id: number, lv: Tab) => lv === 'all' || !catalog.loaded || dish(id)?.level === lv;
const inRoad = (id: number, rd: Tab) => rd === 'all' || !catalog.loaded || dish(id)?.road === rd;
const shown = (id: number) => inLevel(id, level.value) && inRoad(id, road.value);
/** 已学和有残卷的特色菜（各算一次），用来数每一页有几道 */
const allIds = computed(
  () =>
    new Set([
      ...(o.value?.learned ?? []).map((m) => m.mcId),
      ...(o.value?.remnants ?? []).map((r) => r.mcId),
    ]),
);
/** 一排分页：0 道的页不显示（“全部”和选中的那页除外），手机上少占几行 */
function tabs(keys: Tab[], selected: Tab, name: (x: number) => string, count: (x: Tab) => number) {
  return keys
    .map((x) => ({
      key: x,
      n: count(x),
      label: t.value.mc.filter.count(x === 'all' ? t.value.mc.filter.all : name(x), count(x)),
    }))
    .filter((x) => x.key === 'all' || x.key === selected || x.n > 0);
}
const levelTabs = computed(() =>
  tabs(
    ['all', ...LEVELS],
    level.value,
    t.value.mc.filter.level,
    (x) => [...allIds.value].filter((id) => inLevel(id, x) && inRoad(id, road.value)).length,
  ),
);
const roadTabs = computed(() =>
  tabs(
    ['all', ...ROADS],
    road.value,
    (x) => ROAD_NAMES[x] ?? '',
    (x) => [...allIds.value].filter((id) => inRoad(id, x) && inLevel(id, level.value)).length,
  ),
);
const sortedLearned = computed(() =>
  [...(o.value?.learned ?? [])].filter((m) => shown(m.mcId)).sort((a, b) => byLevel(a.mcId, b.mcId)),
);
/** 能学的残卷总数（不管分页）：“全部学会”会把别的页的也学了，按钮上写明 */
const learnableTotal = computed(() => {
  const known = learnedIds.value;
  return (o.value?.remnants ?? []).filter((r) => !known.has(r.mcId) && r.num >= LEARN_REMNANTS).length;
});
/** 残卷分三组（问题记录：能学和不能学的混在一起） */
const groups = computed(() => {
  const rs = [...(o.value?.remnants ?? [])]
    .filter((r) => shown(r.mcId))
    .sort((a, b) => byLevel(a.mcId, b.mcId));
  const known = learnedIds.value;
  return [
    {
      key: 'learnable' as const,
      items: rs.filter((r) => !known.has(r.mcId) && r.num >= LEARN_REMNANTS),
    },
    {
      key: 'short' as const,
      items: rs.filter((r) => !known.has(r.mcId) && r.num < LEARN_REMNANTS),
    },
    { key: 'learned' as const, items: rs.filter((r) => known.has(r.mcId)) },
  ].filter((g) => g.items.length > 0);
});
/** 碎片兑换（问题记录 415）：每级一行，能选这一级能鉴定出来、还没学会的菜；按等级分页时只显示那一级 */
const exPick = reactive<Record<number, string>>({});
const exchangeRows = computed(() => {
  const f = o.value?.fragments ?? [];
  return LEVELS.filter((lv) => (f[lv - 1] ?? 0) > 0 && (level.value === 'all' || level.value === lv)).map(
    (lv) => ({
      level: lv,
      num: f[lv - 1] ?? 0,
      options: [...catalog.mcMap.values()]
        .filter((m) => m.level === lv && m.appraisable && !learnedIds.value.has(m.id))
        .sort((a, b) => a.road - b.road || a.id - b.id),
    }),
  );
});
watch(exchangeRows, (rows) => {
  for (const r of rows)
    if (exPick[r.level] && !r.options.some((m) => String(m.id) === exPick[r.level])) exPick[r.level] = '';
});
/** 一次换几张（backlog 415：碎片多时要点很多下）；最多换到碎片够的张数 */
const exNum = reactive<Record<number, number>>({});
const exMax = (num: number) => Math.max(1, Math.floor(num / (o.value?.fragmentPerRemnant ?? 3)));
const exCount = (lv: number, num: number) => Math.min(exMax(num), Math.max(1, Math.floor(exNum[lv] ?? 1)));
function exchange(lv: number, num: number) {
  const mcId = Number(exPick[lv]);
  if (!mcId) return;
  const n = exCount(lv, num);
  return act(
    async () => {
      await endpoints.mcExchange(mcId, n);
      toast.push(t.value.mc.exchange.done(nameOf(mcId), n));
      exNum[lv] = 1;
    },
    null,
    t.value.mc.exchange.failed,
  );
}

function learnAll() {
  return act(
    async () => {
      const r = await endpoints.mcLearnAll();
      toast.push(t.value.mc.learnedAll(r.learned.length, r.learned.map(nameOf).join(t.value.events.sep)));
    },
    null,
    t.value.mc.learnFailed,
  );
}

async function openCook(mcId: number) {
  try {
    preview.value = await endpoints.mcPreview(mcId);
    cookie.value = false;
  } catch (e) {
    toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}
function cook(n: number) {
  const p = preview.value;
  if (!p) return;
  return act(
    async () => {
      const r = await endpoints.mcCook(p.mcId, n, cookie.value);
      const extra = [r.levelUp ? t.value.mc.levelUp : '', r.bob ? t.value.mc.bob : '']
        .filter(Boolean)
        .join(t.value.events.sep);
      toast.push(
        t.value.mc.cooked(
          GRADE_NAMES[r.cook.grade] ?? '',
          !!r.cook.luck,
          formatNum(r.cook.totalNum),
          formatNum(r.cook.price),
          extra,
        ),
      );
      preview.value = null;
    },
    null,
    t.value.mc.cookFailed,
  );
}
function dump() {
  if (!window.confirm(t.value.mc.dumpConfirm)) return;
  return act(() => endpoints.mcDump(), t.value.mc.dumped, t.value.mc.dumpFailed);
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.mc.loadFailed), 'danger')));
</script>

<template>
  <div v-if="o">
    <div class="d-flex align-items-center mb-2">
      <h5 class="mb-0 flex-fill">{{ t.mc.title }}</h5>
      <RouterLink to="/temple" class="small me-2 dt-go">{{ t.mc.temple }}</RouterLink>
      <RouterLink to="/society/classroom" class="small dt-go">{{ t.mc.classroom }}</RouterLink>
    </div>
    <p v-if="o.star < 1" class="small text-muted">{{ t.mc.needStar }}</p>

    <div
      v-if="o.current"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="mc-current"
    >
      <div class="flex-fill">
        {{ t.mc.onSale }}<b>{{ nameOf(o.current.mcId) }}</b> {{ GRADE_NAMES[o.current.grade]
        }}{{ o.current.luck ? t.mc.lucky : '' }}
        <div class="text-muted">
          {{
            t.mc.saleMeta(
              formatNum(o.current.leftNum),
              formatNum(o.current.totalNum),
              formatNum(o.current.price),
              o.current.eatCount,
            )
          }}{{ o.saleRate !== null && o.saleRate !== 1 ? t.mc.saleRate(formatNum(o.saleRate)) : '' }}
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" data-testid="dump" :disabled="busy" @click="dump">
        {{ t.mc.dump }}
      </button>
    </div>

    <!-- 按级、按道分页（问题记录 414）；按视觉规范用小号胶囊（问题记录 471） -->
    <div v-if="allIds.size > 0" class="mb-2" data-testid="mc-filters">
      <div class="dt-pills mb-1" role="group" :aria-label="t.mc.filter.levelLabel">
        <button
          v-for="x in levelTabs"
          :key="String(x.key)"
          type="button"
          :class="{ active: level === x.key }"
          :aria-pressed="level === x.key"
          :data-testid="`mc-level-${x.key}`"
          @click="level = x.key"
        >
          {{ x.label }}
        </button>
      </div>
      <div class="dt-pills mb-0" role="group" :aria-label="t.mc.filter.roadLabel">
        <button
          v-for="x in roadTabs"
          :key="String(x.key)"
          type="button"
          :class="{ active: road === x.key }"
          :aria-pressed="road === x.key"
          :data-testid="`mc-road-${x.key}`"
          @click="road = x.key"
        >
          {{ x.label }}
        </button>
      </div>
    </div>

    <h6 class="dt-section">
      {{
        filtering ? t.mc.learnedOf(sortedLearned.length, o.learned.length) : t.mc.learned(o.learned.length)
      }}
    </h6>
    <div v-if="o.learned.length === 0" class="small text-muted mb-2">
      {{ t.mc.noLearned }}
    </div>
    <div v-else-if="sortedLearned.length === 0" class="small text-muted mb-2" data-testid="mc-learned-none">
      {{ t.mc.filter.none }}
    </div>
    <div
      v-for="m in sortedLearned"
      :key="m.mcId"
      class="border-bottom py-1 small"
      :data-testid="`learned-${m.mcId}`"
    >
      <div class="d-flex align-items-center">
        <div class="flex-fill">
          <b>{{ nameOf(m.mcId) }}</b>
          <span class="text-muted ms-1">
            {{
              t.mc.dishMeta(
                dish(m.mcId)?.level,
                ROAD_NAMES[dish(m.mcId)?.road ?? 0] ?? '',
                catalog.data('proficiency', m.curlevel)?.name ?? m.levelName,
              )
            }}
          </span>
          <div class="progress mt-1" style="height: 6px">
            <div
              class="progress-bar bg-warning"
              :style="{ width: `${m.expNext ? Math.min(100, (m.curexp / m.expNext) * 100) : 100}%` }"
            ></div>
          </div>
          <div class="text-muted">
            {{ t.mc.proficiency(formatNum(m.curexp), m.expNext ? formatNum(m.expNext) : null) }}
          </div>
        </div>
        <button
          class="btn btn-sm btn-primary ms-2"
          :data-testid="`cook-${m.mcId}`"
          :disabled="busy || o.current !== null || o.star < 1"
          @click="openCook(m.mcId)"
        >
          {{ t.mc.cook }}
        </button>
      </div>
      <div
        v-if="preview && preview.mcId === m.mcId"
        class="bg-light rounded p-2 mt-1"
        data-testid="cook-panel"
      >
        <div>
          {{ t.mc.foods
          }}<span v-for="f in preview.foods" :key="f.foodsId" class="me-2"
            >{{ catalog.foodName(f.foodsId) }} {{ f.have }}</span
          >
        </div>
        <label class="d-block my-1">
          <input
            v-model="cookie"
            type="checkbox"
            class="form-check-input me-1"
            data-testid="cookie"
            :disabled="preview.cookies === 0"
          />{{ t.mc.cookie(preview.cookies) }}
        </label>
        <div class="d-flex flex-wrap gap-1">
          <button
            v-for="c in preview.cookNums"
            :key="c.n"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`cooknum-${c.n}`"
            :disabled="busy || !c.ok || (cookie && preview.cookies < c.n)"
            @click="cook(c.n)"
          >
            {{ t.mc.batches(c.n) }}
          </button>
          <button type="button" class="dt-link-btn" @click="preview = null">{{ t.common.cancel }}</button>
        </div>
      </div>
    </div>

    <h6 class="dt-section">{{ t.mc.remnants }}</h6>
    <!-- 碎片兑换指定残卷（问题记录 415） -->
    <div v-if="exchangeRows.length > 0" class="mb-2 small" data-testid="mc-exchange">
      <div class="text-muted mb-1">{{ t.mc.exchange.title(o.fragmentPerRemnant) }}</div>
      <div
        v-for="r in exchangeRows"
        :key="r.level"
        class="d-flex flex-wrap align-items-center gap-1 py-1 border-bottom"
        :data-testid="`exchange-${r.level}`"
      >
        <span class="me-1">{{ t.mc.exchange.have(r.level, r.num) }}</span>
        <!-- 没选时停在“选一道菜”；菜名长时下拉框收窄、不挤出屏幕（视觉第三轮） -->
        <select
          :value="exPick[r.level] ?? ''"
          class="form-select form-select-sm dt-shrink"
          style="flex-basis: 10rem"
          @change="exPick[r.level] = ($event.target as HTMLSelectElement).value"
        >
          <option value="">{{ t.mc.exchange.pick }}</option>
          <option v-for="m in r.options" :key="m.id" :value="String(m.id)">{{ nameOf(m.id) }}</option>
        </select>
        <input
          v-if="exMax(r.num) > 1"
          v-model.number="exNum[r.level]"
          type="number"
          min="1"
          :max="exMax(r.num)"
          class="form-control form-control-sm"
          style="width: 60px"
          :data-testid="`exchange-num-${r.level}`"
        />
        <button
          class="btn btn-sm btn-outline-primary"
          :disabled="busy || !exPick[r.level] || r.num < o.fragmentPerRemnant"
          @click="exchange(r.level, r.num)"
        >
          {{ t.mc.exchange.btn(exCount(r.level, r.num)) }}
        </button>
      </div>
    </div>
    <div v-if="o.remnants.length === 0" class="small text-muted">{{ t.mc.noRemnants }}</div>
    <div v-else-if="groups.length === 0" class="small text-muted" data-testid="mc-remnants-none">
      {{ t.mc.filter.none }}
    </div>
    <div v-for="g in groups" :key="g.key" class="mb-2" :data-testid="`group-${g.key}`">
      <div class="d-flex align-items-center small fw-bold text-muted mt-1">
        <span class="flex-fill">{{ t.mc.groupTitle(t.mc.groups[g.key], g.items.length) }}</span>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-primary"
          data-testid="learn-all"
          :disabled="busy"
          @click="learnAll"
        >
          {{ learnableTotal > g.items.length ? t.mc.learnAllTotal(learnableTotal) : t.mc.learnAll }}
        </button>
      </div>
      <div
        v-for="r in g.items"
        :key="r.mcId"
        :class="[
          'd-flex flex-wrap align-items-center justify-content-end gap-1 border-bottom py-1 small',
          { 'bg-success-subtle': g.key === 'learnable' },
        ]"
      >
        <!-- 西文“Descomponer”这类长按钮放不下时，按钮换到下一行（视觉第三轮） -->
        <div class="flex-fill" style="min-width: 45%">
          <b>{{ nameOf(r.mcId) }}</b
          >{{ t.common.times }}{{ r.num }}
          <span class="text-muted">
            {{
              t.mc.remnantMeta(
                dish(r.mcId)?.level,
                ROAD_NAMES[dish(r.mcId)?.road ?? 0] ?? '',
                formatNum(dish(r.mcId)?.coin ?? 0),
              )
            }}
          </span>
          <span v-if="g.key === 'short'" class="text-danger">{{ t.mc.short(LEARN_REMNANTS - r.num) }}</span>
        </div>
        <button
          v-if="g.key === 'learnable'"
          class="btn btn-sm btn-primary"
          :data-testid="`learn-${r.mcId}`"
          :disabled="busy"
          @click="act(() => endpoints.mcLearn(r.mcId), t.mc.learnedName(nameOf(r.mcId)), t.mc.learnFailed)"
        >
          {{ t.mc.learn }}
        </button>
        <input
          v-model.number="qty[r.mcId]"
          type="number"
          min="1"
          :max="r.num"
          class="form-control form-control-sm"
          style="width: 60px"
          :data-testid="`remnant-num-${r.mcId}`"
        />
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`sell-${r.mcId}`"
          :disabled="busy"
          @click="
            act(() => endpoints.mcRemnantSell(r.mcId, numOf(r.mcId, r.num)), t.mc.sold, t.mc.sellFailed)
          "
        >
          {{ t.mc.sell }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :data-testid="`decompose-${r.mcId}`"
          :disabled="busy"
          @click="
            act(
              () => endpoints.mcRemnantDecompose(r.mcId, numOf(r.mcId, r.num)),
              t.mc.decomposed,
              t.mc.decomposeFailed,
            )
          "
        >
          {{ t.mc.decompose }}
        </button>
      </div>
    </div>
  </div>
</template>
