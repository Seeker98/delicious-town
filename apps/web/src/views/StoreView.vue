<script setup lang="ts">
import { remainText } from '../utils/remain';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { gameDay, SHARED_GOODS, type LedgerRecordDto, type StoreDto, type StoreItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import DtStepper from '../components/DtStepper.vue';
import DtTabPanel from '../components/DtTabPanel.vue';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useToastStore } from '../stores/toast';
import { recordLabel } from '../utils/events';
import { clampQty, formatNum, gameDateTime, gameTimeOfDay } from '../utils/format';
import { serverNowMs } from '../utils/serverNow';
import { groupStoreItems } from '../utils/storeSort';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: ['items', 'souvenirs', 'records'] as const });
const tabItems = computed(() =>
  (['items', 'souvenirs', 'records'] as const).map((k) => ({ key: k, label: t.value.store.tabs[k] })),
);

const type = ref<number | undefined>(undefined);
const data = ref<StoreDto | null>(null);
/** 还没读回来是 null，显示骨架行（backlog P4：原来初值是空数组，先闪一下“没有记录”） */
const records = ref<LedgerRecordDto[] | null>(null);
const range = ref('1h');
const qty = reactive<Record<number, number>>({});
const busy = ref(false);
const TYPES = [undefined, 0, 1, 2, 3, 9] as const;
const typeLabel = (v: number | undefined) =>
  v === undefined ? t.value.common.all : (t.value.store.types[String(v)] ?? t.value.common.other);
/** 纪念品的道具类型，和 @dt/config 的 GOODS_TYPE.souvenir 相同（148-2） */
const GOODS_TYPE_SOUVENIR = 10;
/** 按仓库接口给的类型判断（问题记录 276）：前端目录可能比服务器旧，不能靠它分类 */
const isSouvenir = (it: StoreItemDto) => it.type === GOODS_TYPE_SOUVENIR;
/** 纪念品标签页单独按类型读取：仓库页选了别的类型筛选时，已读的数据里没有纪念品 */
const souvenirs = ref<StoreItemDto[] | null>(null);
/** 点一格纪念品弹出面板看全部说明（backlog P7：格子里说明截成两行，长的看不全） */
const pickedSouvenir = ref<StoreItemDto | null>(null);
/** 仓库排序（问题记录 186）：按类型分组，组内先看剩余时间，再按拼音 */
const groups = computed(() =>
  data.value
    ? groupStoreItems(
        // 纪念品只在"纪念品"标签页显示（148-2 设计 §6.2）
        data.value.items.filter((it) => !isSouvenir(it)),
        (id) => data.value?.items.find((it) => it.goodsId === id)?.type ?? -1,
        (id) => catalog.goodsName(id),
      )
    : [],
);
const RANGES = ['1h', '6h', '12h', 'today', 'yesterday', 'before'] as const;
/** 今天（北京时间）的记录只写时间；不是今天的带上日期（backlog：看不出是哪天；终审：选 12 小时也会跨午夜） */
const recordTime = (at: string) =>
  gameDay(new Date(at)) !== gameDay(new Date(serverNowMs()))
    ? gameDateTime(at, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : gameTimeOfDay(at);

/** 读取失败时不再显示骨架行（终审 I4） */
const failed = ref(false);
async function load() {
  data.value = await endpoints.store(type.value);
  void catalog.refreshIfMissing(data.value.items.map((it) => it.goodsId));
}
async function loadSouvenirs() {
  try {
    const items = (await endpoints.store(GOODS_TYPE_SOUVENIR)).items.filter(isSouvenir);
    await catalog.refreshIfMissing(items.map((it) => it.goodsId));
    souvenirs.value = items;
  } catch (e) {
    souvenirs.value ??= [];
    toast.push(errorMessage(e, t.value.store.souvenirsFailed), 'danger');
  }
}
async function loadRecords() {
  try {
    records.value = await endpoints.storeRecords(range.value);
  } catch (e) {
    records.value ??= [];
    toast.push(errorMessage(e, t.value.store.loadFailed), 'danger');
  }
}
async function run(fn: () => Promise<unknown>, fallback: string) {
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
/** 填的数超过上限时按上限算（使用：单次上限 maxUse；出售：持有数） */
const useN = (it: StoreItemDto) => clampQty(qty[it.goodsId], it.maxUse);
/** 步进器的上限：能批量使用的按一次最多用几个，能卖的按持有（界面改版 P4） */
const qtyMax = (it: StoreItemDto) => (it.batch && it.usable ? clampQty(it.num, it.maxUse) : it.num);
/** 信息行的各段：只有一段时不带分隔点（终审：开头多一个点） */
function metaParts(it: StoreItemDto): Array<{ text: string; danger: boolean }> {
  const out: Array<{ text: string; danger: boolean }> = [];
  if (it.expiresAt) out.push({ text: expires(it.expiresAt), danger: false });
  if (it.sellPrice !== null)
    out.push({ text: t.value.store.unitPrice(formatNum(it.sellPrice)), danger: false });
  if (it.usable && it.maxUse === 0) out.push({ text: t.value.store.atLimit, danger: true });
  else if (it.batch) out.push({ text: t.value.store.batchMax(it.maxUse), danger: false });
  return out;
}
const sellN = (it: StoreItemDto) => clampQty(Math.floor(qty[it.goodsId] ?? 1), it.num);
const confirm = useConfirmStore();
/** 卖出、丢弃收不回来，先确认（问题记录 128；界面改版 P4：确认面板，丢弃是危险操作） */
async function sell(it: StoreItemDto) {
  const n = sellN(it);
  const coin = n * (it.sellPrice ?? 0);
  const title = t.value.store.sellConfirm(n, catalog.goodsName(it.goodsId), formatNum(coin));
  // 先收起道具面板再问，取消了再打开（和厨具页一样，不叠两层面板）
  picked.value = null;
  if (!(await confirm.ask({ title, ok: t.value.store.sell }))) {
    picked.value = it.goodsId;
    return;
  }
  void run(() => endpoints.sell(it.goodsId, n), t.value.store.sellFailed);
}
async function discard(it: StoreItemDto) {
  const title = t.value.store.discardConfirm(catalog.goodsName(it.goodsId));
  picked.value = null;
  if (!(await confirm.ask({ title, ok: t.value.store.discard, danger: true }))) {
    picked.value = it.goodsId;
    return;
  }
  void run(() => endpoints.discard(it.goodsId), t.value.store.discardFailed);
}
/** 点一格弹出面板（界面改版 P7，和橱柜一样）；道具用完、卖完不在了就收起 */
const picked = ref<number | null>(null);
const pickedItem = computed(() => data.value?.items.find((it) => it.goodsId === picked.value) ?? null);
watch(pickedItem, (it) => {
  if (!it) picked.value = null;
});
const pick = (id: number) => (picked.value = picked.value === id ? null : id);
const usedPct = computed(() =>
  data.value ? Math.min(100, Math.round((data.value.kinds / Math.max(1, data.value.storeNum)) * 100)) : 0,
);
/** 格子下面一行：剩余时间，或者用到上限了 */
const cellSub = (it: StoreItemDto) =>
  it.expiresAt ? expires(it.expiresAt) : it.usable && it.maxUse === 0 ? t.value.store.atLimit : ' ';
const cellLabel = (it: StoreItemDto) =>
  [
    t.value.common.qty(catalog.goodsName(it.goodsId), formatNum(it.num)),
    it.expiresAt ? expires(it.expiresAt) : '',
  ]
    .filter(Boolean)
    .join(' · ');
function use(it: StoreItemDto) {
  void run(() => endpoints.useGoods(it.goodsId, it.batch ? useN(it) : 1), t.value.store.useFailed);
}
/** 剩余时间显示到分钟（backlog 6B-2，和设施、效果一致） */
const expires = (at: string | null) => (at ? remainText(at) : '');
const recordName = (r: LedgerRecordDto) => recordLabel(r, catalog);

watch(type, () => void load());
watch(range, () => void loadRecords());
// 纪念品、流水用到才读：切过去、网址直接带 ?tab= 都读（终审 I2：原来直接打开时写“没有”）
watch(
  tab,
  (k) => {
    // 换标签收起道具面板（浏览器前进后退回来时不自己弹出来）
    picked.value = null;
    if (k === 'souvenirs') void loadSouvenirs();
    if (k === 'records') void loadRecords();
  },
  { immediate: true },
);
onMounted(() =>
  load().catch((e) => {
    failed.value = true;
    toast.push(errorMessage(e, t.value.store.loadFailed), 'danger');
  }),
);
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />
  <DtTabPanel :tab="tab">
    <DtEmpty
      v-if="tab === 'items' && !data && failed"
      :title="t.store.loadFailed"
      data-testid="store-failed"
    />
    <DtSkeleton v-else-if="tab === 'items' && !data" :rows="5" data-testid="store-skeleton" />
    <template v-if="tab === 'items' && data">
      <!-- 用了多少种画成进度条（界面改版 P7，和橱柜一样）；厨具另算一句 -->
      <div class="dt-cup-meta">
        <div class="dt-cup-slots">
          <span
            class="dt-cup-slotbar"
            role="progressbar"
            :aria-valuenow="usedPct"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="t.store.used(data.kinds, data.storeNum)"
            ><span :style="{ width: `${usedPct}%` }"></span
          ></span>
          <span class="dt-cup-slots-label" aria-hidden="true" data-testid="store-used">{{
            t.store.used(data.kinds, data.storeNum)
          }}</span>
        </div>
        <div v-if="data.equips > 0" class="dt-cup-rules">
          {{ t.store.equipsBefore(data.equips) }}
          <RouterLink to="/rest/equip" class="dt-go">{{ t.store.equipsLink }}</RouterLink
          >{{ t.store.equipsAfter }}
        </div>
      </div>
      <!-- 按类型筛选：一排筛选胶囊（原来是下拉框） -->
      <div
        class="dt-pills dt-pills-scroll"
        role="group"
        :aria-label="t.store.typeLabel"
        data-testid="store-types"
      >
        <button
          v-for="v in TYPES"
          :key="String(v)"
          type="button"
          :class="{ active: type === v }"
          :aria-pressed="type === v"
          :data-testid="`store-type-${v ?? 'all'}`"
          @click="type = v"
        >
          {{ typeLabel(v) }}
        </button>
      </div>
      <template v-for="g in groups" :key="g.type">
        <h6 v-if="type === undefined" class="dt-bag-group" :data-testid="`store-group-${g.type}`">
          {{ typeLabel(g.type) }}<span>{{ g.items.length }}</span>
        </h6>
        <!-- 背包格子（界面改版 P7，和橱柜一样）：4 列，道具图、右上角数量、名字；下面一行剩余时间或“已达上限”；点一格弹出面板 -->
        <div class="dt-bag mb-2">
          <button
            v-for="it in g.items"
            :key="it.goodsId"
            type="button"
            :class="['dt-bag-cell', { 'is-picked': picked === it.goodsId }]"
            aria-haspopup="dialog"
            :aria-label="cellLabel(it)"
            :data-testid="`store-item-${it.goodsId}`"
            @click="pick(it.goodsId)"
          >
            <span v-if="it.num > 1" class="dt-bag-num" aria-hidden="true">{{ formatNum(it.num) }}</span>
            <DtArt :name="catalog.goodsArt(it.goodsId)" :size="36" />
            <span class="dt-bag-name" aria-hidden="true">{{ catalog.goodsName(it.goodsId) }}</span>
            <span
              :class="['dt-bag-need', { 'is-danger': it.usable && it.maxUse === 0 }]"
              aria-hidden="true"
              >{{ cellSub(it) }}</span
            >
          </button>
        </div>
      </template>
    </template>

    <!-- 点一件：大图、持有、单价；数量、使用、卖出（卖出、丢弃先确认） -->
    <DtSheet
      :open="tab === 'items' && !!pickedItem"
      :title="pickedItem ? catalog.goodsName(pickedItem.goodsId) : ''"
      @close="picked = null"
    >
      <div v-if="pickedItem" class="dt-detail" data-testid="store-sheet">
        <div class="dt-detail-head">
          <span class="dt-detail-art"><DtArt :name="catalog.goodsArt(pickedItem.goodsId)" :size="52" /></span>
          <div class="dt-detail-info">
            <div>{{ typeLabel(pickedItem.type) }}</div>
            <div class="dt-detail-sub">
              <template v-for="(p, i) in metaParts(pickedItem)" :key="i"
                ><span v-if="i > 0"> · </span
                ><span :class="{ 'text-danger': p.danger }">{{ p.text }}</span></template
              >
            </div>
          </div>
        </div>
        <p v-if="catalog.goodsMap.get(pickedItem.goodsId)?.desc" class="dt-detail-note">
          {{ catalog.goodsMap.get(pickedItem.goodsId)?.desc }}
        </p>
        <div v-if="pickedItem.batch || pickedItem.sellPrice !== null" class="dt-detail-qty">
          <span>{{ t.store.howMany }}</span>
          <button
            v-if="qtyMax(pickedItem) > 1"
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-testid="store-qty-all"
            @click="qty[pickedItem.goodsId] = qtyMax(pickedItem)"
          >
            {{ t.common.all }}
          </button>
          <DtStepper
            :model-value="pickedItem.batch && pickedItem.usable ? useN(pickedItem) : sellN(pickedItem)"
            :min="1"
            :max="qtyMax(pickedItem)"
            testid="store-qty"
            @update:model-value="qty[pickedItem.goodsId] = $event"
          />
        </div>
      </div>
      <template v-if="pickedItem" #actions>
        <div class="dt-cup-actions">
          <button
            v-if="pickedItem.goodsId === SHARED_GOODS.starPromoHonor"
            type="button"
            class="btn btn-outline-danger"
            :disabled="busy"
            data-testid="store-discard"
            @click="discard(pickedItem)"
          >
            {{ t.store.discard }}
          </button>
          <button
            v-if="pickedItem.sellPrice !== null"
            type="button"
            class="btn btn-light"
            :disabled="busy"
            data-testid="store-sell"
            @click="sell(pickedItem)"
          >
            {{ t.store.sellFor(formatNum(sellN(pickedItem) * (pickedItem.sellPrice ?? 0))) }}
          </button>
          <button
            v-if="pickedItem.usable"
            type="button"
            class="btn btn-primary"
            :disabled="busy || pickedItem.maxUse === 0"
            data-testid="store-use"
            @click="use(pickedItem)"
          >
            {{ t.store.useN(pickedItem.batch ? useN(pickedItem) : 1) }}
          </button>
        </div>
      </template>
    </DtSheet>

    <template v-if="tab === 'records'">
      <div class="dt-pills dt-pills-scroll" role="group" :aria-label="t.store.rangeLabel">
        <button
          v-for="r in RANGES"
          :key="r"
          type="button"
          :class="{ active: range === r }"
          :aria-pressed="range === r"
          :data-testid="`range-${r}`"
          @click="range = r"
        >
          {{ t.store.ranges[r] }}
        </button>
      </div>
      <!-- 每条一行（只读行）：时间 + 文字，右边增减 -->
      <DtSkeleton v-if="records === null" :rows="4" data-testid="records-skeleton" />
      <div v-else-if="records.length > 0" class="dt-card dt-list-card">
        <div v-for="(r, i) in records" :key="i" class="dt-feed">
          <span class="dt-feed-time" :data-testid="`record-time-${i}`">{{ recordTime(r.at) }}</span>
          <span class="dt-feed-text flex-fill">{{ recordName(r) }}</span>
          <b :class="['text-nowrap', r.delta >= 0 ? 'text-success' : 'text-danger']"
            >{{ r.delta >= 0 ? '+' : '' }}{{ formatNum(r.delta) }}</b
          >
        </div>
      </div>
      <DtEmpty v-else :title="t.store.noRecords" data-testid="records-empty" />
    </template>
    <template v-if="tab === 'souvenirs'">
      <DtSkeleton v-if="souvenirs === null" :rows="3" data-testid="souvenirs-skeleton" />
      <DtEmpty
        v-else-if="souvenirs.length === 0"
        :title="t.store.noSouvenirs"
        data-testid="souvenirs-empty"
      />
      <!-- 纪念品也是格子，名字下面一行说明（只看，不能用）；点一格弹出面板看全部说明 -->
      <div v-else class="dt-bag">
        <button
          v-for="it in souvenirs"
          :key="it.goodsId"
          type="button"
          class="dt-bag-cell"
          aria-haspopup="dialog"
          :data-testid="`souvenir-${it.goodsId}`"
          @click="pickedSouvenir = it"
        >
          <span v-if="it.num > 1" class="dt-bag-num">{{ formatNum(it.num) }}</span>
          <DtArt :name="catalog.goodsArt(it.goodsId)" :size="36" />
          <span class="dt-bag-name">{{ catalog.goodsName(it.goodsId) }}</span>
          <span class="dt-bag-need dt-clamp2">{{ catalog.goodsMap.get(it.goodsId)?.desc }}</span>
        </button>
      </div>
      <DtSheet
        :open="!!pickedSouvenir"
        :title="pickedSouvenir ? catalog.goodsName(pickedSouvenir.goodsId) : ''"
        @close="pickedSouvenir = null"
      >
        <div v-if="pickedSouvenir" class="dt-detail" data-testid="souvenir-sheet">
          <div class="dt-detail-head">
            <span class="dt-detail-art"
              ><DtArt :name="catalog.goodsArt(pickedSouvenir.goodsId)" :size="52"
            /></span>
            <div class="dt-detail-info">
              <div>{{ t.store.tabs.souvenirs }}</div>
              <div class="dt-detail-sub">{{ t.store.shop.owned(pickedSouvenir.num) }}</div>
            </div>
          </div>
          <p v-if="catalog.goodsMap.get(pickedSouvenir.goodsId)?.desc" class="dt-detail-note">
            {{ catalog.goodsMap.get(pickedSouvenir.goodsId)?.desc }}
          </p>
        </div>
      </DtSheet>
    </template>
  </DtTabPanel>
</template>
