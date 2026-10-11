<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { McOverviewDto, McPreviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import DtArt from '../DtArt.vue';
import DtEmpty from '../DtEmpty.vue';
import DtSheet from '../DtSheet.vue';
import DtStepper from '../DtStepper.vue';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { GRADE_NAMES, ROAD_NAMES } from '../../utils/labels';

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
function tabs(
  keys: Tab[],
  selected: Tab,
  name: (x: number) => string,
  count: (x: Tab) => number,
  all = t.value.mc.filter.all,
) {
  return keys
    .map((x) => ({
      key: x,
      n: count(x),
      label: t.value.mc.filter.count(x === 'all' ? all : name(x), count(x)),
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
    // 按道是下拉框（界面改版 P7），“全部”写成“全部道”，和旁边按级的“全部”分开
    t.value.mc.filter.allRoads,
  ),
);
/** 已学每页 12 道（界面改版 P7：249 道一次全列出来整页三万像素高）；换筛选回到第一页 */
const PAGE = 12;
const learnedPage = ref(1);
watch([level, road], () => (learnedPage.value = 1));
const learnedPages = computed(() => Math.max(1, Math.ceil(sortedLearned.value.length / PAGE)));
const pagedLearned = computed(() =>
  sortedLearned.value.slice((learnedPage.value - 1) * PAGE, learnedPage.value * PAGE),
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
const confirm = useConfirmStore();
/** 倒掉在售的特色菜：危险操作，确认面板红色按钮（界面改版 P4） */
async function dump() {
  if (!(await confirm.ask({ title: t.value.mc.dumpConfirm, ok: t.value.mc.dump, danger: true }))) return;
  return act(() => endpoints.mcDump(), t.value.mc.dumped, t.value.mc.dumpFailed);
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.mc.loadFailed), 'danger')));
</script>

<template>
  <div v-if="o">
    <!-- 去哪里得到、练熟（界面改版 P7）：整行去别处，不再是右上角两个文字链接 -->
    <div class="dt-card dt-rows-card mb-2" data-testid="mc-links">
      <RouterLink to="/temple" class="dt-row is-link">
        <span class="dt-row-ico"><DtArt name="place-temple" :size="22" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.mc.temple }}</span
          ><span class="dt-row-sub">{{ t.mc.templeSub }}</span></span
        >
      </RouterLink>
      <RouterLink to="/society/classroom" class="dt-row is-link">
        <span class="dt-row-ico"><DtArt name="place-society" :size="22" /></span>
        <span class="dt-row-main"
          ><span class="dt-row-title">{{ t.mc.classroom }}</span></span
        >
      </RouterLink>
    </div>
    <p v-if="o.star < 1" class="dt-block-note">{{ t.mc.needStar }}</p>

    <div v-if="o.current" class="dt-card mb-2 small d-flex align-items-center" data-testid="mc-current">
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
      <button
        class="btn btn-sm btn-outline-danger flex-shrink-0 text-nowrap ms-2"
        data-testid="dump"
        :disabled="busy"
        @click="dump"
      >
        {{ t.mc.dump }}
      </button>
    </div>

    <!-- 已学（界面改版 P7）：标题一行；按道是下拉胶囊、按级是一排筛选胶囊（问题记录 414）；一道一行，每页 12 道 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">
          {{
            filtering
              ? t.mc.learnedOf(sortedLearned.length, o.learned.length)
              : t.mc.learned(o.learned.length)
          }}
        </h2>
      </div>
      <div
        v-if="allIds.size > 0"
        class="dt-pills dt-pills-scroll"
        role="group"
        :aria-label="t.mc.filter.levelLabel"
        data-testid="mc-filters"
      >
        <span class="dt-select-pill">
          <select v-model="road" :aria-label="t.mc.filter.roadLabel" data-testid="mc-road">
            <option v-for="x in roadTabs" :key="String(x.key)" :value="x.key">{{ x.label }}</option>
          </select>
        </span>
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
      <DtEmpty v-if="o.learned.length === 0" :title="t.mc.noLearned" data-testid="mc-learned-empty" />
      <div v-else-if="sortedLearned.length === 0" class="dt-block-note" data-testid="mc-learned-none">
        {{ t.mc.filter.none }}
      </div>
      <div v-if="sortedLearned.length > 0" class="dt-card dt-rows-card">
        <div
          v-for="m in pagedLearned"
          :key="m.mcId"
          class="dt-row dt-mc-row"
          :data-testid="`learned-${m.mcId}`"
        >
          <span class="dt-row-main">
            <span class="dt-row-title"
              >{{ nameOf(m.mcId)
              }}<span v-if="dish(m.mcId)?.level" class="dt-tag dt-tag-primary">{{
                t.mc.filter.level(dish(m.mcId)!.level)
              }}</span
              ><span v-if="ROAD_NAMES[dish(m.mcId)?.road ?? 0]" class="dt-tag dt-tag-mute">{{
                ROAD_NAMES[dish(m.mcId)?.road ?? 0]
              }}</span></span
            >
            <span class="dt-mc-prof">
              <span class="dt-mc-bar"
                ><span
                  :style="{ width: `${m.expNext ? Math.min(100, (m.curexp / m.expNext) * 100) : 100}%` }"
                ></span
              ></span>
              <span
                >{{ catalog.data('proficiency', m.curlevel)?.name ?? m.levelName }}
                {{ t.mc.proficiency(formatNum(m.curexp), m.expNext ? formatNum(m.expNext) : null) }}</span
              >
            </span>
          </span>
          <button
            class="btn btn-sm btn-outline-primary"
            :data-testid="`cook-${m.mcId}`"
            :disabled="busy || o.current !== null || o.star < 1"
            @click="openCook(m.mcId)"
          >
            {{ t.mc.cook }}
          </button>
        </div>
      </div>
      <div v-if="learnedPages > 1" class="dt-pager" data-testid="mc-pager">
        <button
          type="button"
          class="btn btn-sm btn-light"
          :disabled="learnedPage <= 1"
          @click="learnedPage -= 1"
        >
          {{ t.common.prevPage }}
        </button>
        <span class="dt-meta">{{ learnedPage }} / {{ learnedPages }}</span>
        <button
          type="button"
          class="btn btn-sm btn-light"
          :disabled="learnedPage >= learnedPages"
          @click="learnedPage += 1"
        >
          {{ t.common.nextPage }}
        </button>
      </div>
    </section>
    <!-- 烹制：底部面板写所需食材、幸运饼干开关、做几份 -->
    <DtSheet
      :open="!!preview"
      :title="preview ? t.mc.cookTitle(nameOf(preview.mcId)) : ''"
      @close="preview = null"
    >
      <div v-if="preview" data-testid="cook-panel">
        <div class="dt-meta mb-2">
          {{ t.mc.foods
          }}<span v-for="f in preview.foods" :key="f.foodsId" class="me-2"
            >{{ catalog.foodName(f.foodsId) }} {{ f.have }}</span
          >
        </div>
        <label class="dt-row dt-mc-cookie">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.mc.cookie(preview.cookies) }}</span></span
          >
          <span class="dt-row-end form-switch"
            ><input
              v-model="cookie"
              type="checkbox"
              role="switch"
              class="form-check-input"
              data-testid="cookie"
              :disabled="preview.cookies === 0"
          /></span>
        </label>
        <div class="dt-mc-nums">
          <button
            v-for="c in preview.cookNums"
            :key="c.n"
            class="btn btn-outline-primary"
            :data-testid="`cooknum-${c.n}`"
            :disabled="busy || !c.ok || (cookie && preview.cookies < c.n)"
            @click="cook(c.n)"
          >
            {{ t.mc.batches(c.n) }}
          </button>
        </div>
      </div>
    </DtSheet>

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.mc.remnants }}</h2>
      </div>
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
          <DtStepper
            v-if="exMax(r.num) > 1"
            :model-value="exCount(r.level, r.num)"
            :min="1"
            :max="exMax(r.num)"
            size="sm"
            :testid="`exchange-num-${r.level}`"
            @update:model-value="exNum[r.level] = $event"
          />
          <button
            class="btn btn-sm btn-outline-primary"
            :data-testid="`exchange-go-${r.level}`"
            :disabled="busy || !exPick[r.level] || r.num < o.fragmentPerRemnant"
            @click="exchange(r.level, r.num)"
          >
            {{ t.mc.exchange.btn(exCount(r.level, r.num)) }}
          </button>
        </div>
      </div>
      <DtEmpty v-if="o.remnants.length === 0" :title="t.mc.noRemnants" data-testid="mc-remnants-empty" />
      <div v-else-if="groups.length === 0" class="small text-muted" data-testid="mc-remnants-none">
        {{ t.mc.filter.none }}
      </div>
      <!-- 残卷按组各一张卡片（界面改版 P4） -->
      <div v-for="g in groups" :key="g.key" class="dt-card mb-2" :data-testid="`group-${g.key}`">
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
          <DtStepper
            :model-value="numOf(r.mcId, r.num)"
            :min="1"
            :max="r.num"
            size="sm"
            :testid="`remnant-num-${r.mcId}`"
            @update:model-value="qty[r.mcId] = $event"
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
    </section>
  </div>
</template>
