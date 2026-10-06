<script setup lang="ts">
import { remainText } from '../utils/remain';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { SHARED_GOODS, type LedgerRecordDto, type StoreDto, type StoreItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useLocaleStore } from '../stores/locale';
import { useToastStore } from '../stores/toast';
import { recordLabel } from '../utils/events';
import { formatNum } from '../utils/format';
import { groupStoreItems } from '../utils/storeSort';

const catalog = useCatalogStore();
const locale = useLocaleStore();
const toast = useToastStore();
const t = useT();
const tab = ref<'items' | 'souvenirs' | 'records'>('items');
const type = ref<number | undefined>(undefined);
const data = ref<StoreDto | null>(null);
const records = ref<LedgerRecordDto[]>([]);
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
const souvenirs = ref<StoreItemDto[]>([]);
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

async function load() {
  data.value = await endpoints.store(type.value);
  void catalog.refreshIfMissing(data.value.items.map((it) => it.goodsId));
}
async function loadSouvenirs() {
  try {
    souvenirs.value = (await endpoints.store(GOODS_TYPE_SOUVENIR)).items.filter(isSouvenir);
    await catalog.refreshIfMissing(souvenirs.value.map((it) => it.goodsId));
  } catch (e) {
    toast.push(errorMessage(e, t.value.store.souvenirsFailed), 'danger');
  }
}
async function loadRecords() {
  records.value = await endpoints.storeRecords(range.value);
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
const useN = (it: StoreItemDto) => Math.max(1, Math.min(qty[it.goodsId] ?? 1, it.maxUse));
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
const sellN = (it: StoreItemDto) => Math.max(1, Math.min(Math.floor(qty[it.goodsId] ?? 1), it.num));
/** 卖出、丢弃收不回来，先确认（问题记录 128） */
function sell(it: StoreItemDto) {
  const n = sellN(it);
  const coin = n * (it.sellPrice ?? 0);
  if (!window.confirm(t.value.store.sellConfirm(n, catalog.goodsName(it.goodsId), formatNum(coin)))) return;
  void run(() => endpoints.sell(it.goodsId, n), t.value.store.sellFailed);
}
function discard(it: StoreItemDto) {
  if (!window.confirm(t.value.store.discardConfirm(catalog.goodsName(it.goodsId)))) return;
  void run(() => endpoints.discard(it.goodsId), t.value.store.discardFailed);
}
/** 剩余时间显示到分钟（backlog 6B-2，和设施、效果一致） */
const expires = (at: string | null) => (at ? remainText(at) : '');
const recordName = (r: LedgerRecordDto) => recordLabel(r, catalog);

watch(type, () => void load());
watch(range, () => void loadRecords());
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.store.loadFailed), 'danger')));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li class="nav-item">
      <a :class="['nav-link', { active: tab === 'items' }]" href="#" @click.prevent="tab = 'items'">{{
        t.store.tabs.items
      }}</a>
    </li>
    <li class="nav-item">
      <a
        :class="['nav-link', { active: tab === 'souvenirs' }]"
        href="#"
        data-testid="tab-souvenirs"
        @click.prevent="((tab = 'souvenirs'), loadSouvenirs())"
        >{{ t.store.tabs.souvenirs }}</a
      >
    </li>
    <li class="nav-item">
      <a
        :class="['nav-link', { active: tab === 'records' }]"
        href="#"
        @click.prevent="((tab = 'records'), loadRecords())"
        >{{ t.store.tabs.records }}</a
      >
    </li>
  </ul>
  <template v-if="tab === 'items' && data">
    <div class="d-flex align-items-center mb-2 small">
      <select v-model="type" class="form-select form-select-sm w-auto">
        <option v-for="v in TYPES" :key="String(v)" :value="v">{{ typeLabel(v) }}</option>
      </select>
      <span class="ms-auto text-muted">{{ t.store.used(data.kinds, data.storeNum) }}</span>
    </div>
    <div v-if="data.equips > 0" class="small text-muted mb-2">
      {{ t.store.equipsBefore(data.equips) }}
      <RouterLink to="/rest/equip">{{ t.store.equipsLink }}</RouterLink
      >{{ t.store.equipsAfter }}
    </div>
    <template v-for="g in groups" :key="g.type">
      <h6 v-if="type === undefined" class="dt-group-label" :data-testid="`store-group-${g.type}`">
        {{ typeLabel(g.type) }}
      </h6>
      <div v-for="it in g.items" :key="it.goodsId" class="dt-item">
        <div class="dt-item-main">
          <!-- 只截名字，数量总是显示；剩余时间、单价放第二行（审查、视觉规范） -->
          <div class="d-flex gap-1">
            <span class="dt-item-title">{{ catalog.goodsName(it.goodsId) }}</span>
            <span class="dt-store-num text-nowrap">×{{ formatNum(it.num) }}</span>
          </div>
          <div v-if="metaParts(it).length > 0" class="dt-meta">
            <template v-for="(p, i) in metaParts(it)" :key="i"
              ><span v-if="i > 0"> · </span
              ><span :class="{ 'text-danger': p.danger }">{{ p.text }}</span></template
            >
          </div>
        </div>
        <div class="dt-item-actions">
          <input
            v-if="it.batch || it.sellPrice !== null"
            v-model.number="qty[it.goodsId]"
            type="number"
            min="1"
            :max="it.num"
            class="form-control form-control-sm dt-qty"
            @change="qty[it.goodsId] = it.batch && it.usable ? useN(it) : sellN(it)"
          />
          <button
            v-if="it.usable"
            class="btn btn-sm btn-primary"
            :disabled="busy || it.maxUse === 0"
            @click="run(() => endpoints.useGoods(it.goodsId, it.batch ? useN(it) : 1), t.store.useFailed)"
          >
            {{ t.store.use }}
          </button>
          <button
            v-if="it.sellPrice !== null"
            class="btn btn-sm btn-outline-secondary"
            :disabled="busy"
            @click="sell(it)"
          >
            {{ t.store.sell }}
          </button>
          <button
            v-if="it.goodsId === SHARED_GOODS.starPromoHonor"
            class="btn btn-sm btn-outline-danger"
            :disabled="busy"
            @click="discard(it)"
          >
            <i class="bi bi-trash"></i> {{ t.store.discard }}
          </button>
        </div>
      </div>
    </template>
  </template>
  <template v-if="tab === 'records'">
    <select v-model="range" class="form-select form-select-sm w-auto mb-2">
      <option v-for="r in RANGES" :key="r" :value="r">{{ t.store.ranges[r] }}</option>
    </select>
    <div v-for="(r, i) in records" :key="i" class="d-flex border-bottom py-1 small">
      <span class="text-muted me-2">{{ new Date(r.at).toLocaleTimeString(locale.locale) }}</span>
      {{ recordName(r) }}
      <b :class="['ms-auto', r.delta >= 0 ? 'text-success' : 'text-danger']"
        >{{ r.delta >= 0 ? '+' : '' }}{{ formatNum(r.delta) }}</b
      >
    </div>
    <div v-if="records.length === 0" class="dt-empty">{{ t.store.noRecords }}</div>
  </template>
  <template v-if="tab === 'souvenirs'">
    <div v-if="souvenirs.length === 0" class="text-muted small">{{ t.store.noSouvenirs }}</div>
    <div
      v-for="it in souvenirs"
      :key="it.goodsId"
      class="d-flex gap-2 border-bottom py-2"
      :data-testid="`souvenir-${it.goodsId}`"
    >
      <GameImg
        :path="`goods/${catalog.goodsName(it.goodsId)}`"
        :alt="catalog.goodsName(it.goodsId)"
        fallback-icon="bi-gift"
      />
      <div class="flex-fill">
        <div>
          <b>{{ catalog.goodsName(it.goodsId) }}</b
          ><span class="small text-muted">{{ t.common.times }}{{ it.num }}</span>
        </div>
        <div class="small text-muted">{{ catalog.goodsMap.get(it.goodsId)?.desc }}</div>
      </div>
    </div>
  </template>
</template>
