<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeMessages } from '../i18n';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { equipName } from '../utils/equipName';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const id = Number(route.params.id);
const d = ref<EquipDetailDto | null>(null);
const stone = ref(false);
const gemPick = ref<number | null>(null);
const backPick = ref<number | null>(null);
const busy = ref(false);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROWS = ['base', 'boost', 'gem', 'total'] as const;

async function load() {
  d.value = await endpoints.equipDetail(id);
  gemPick.value = d.value.gems[0]?.goodsId ?? null;
  backPick.value = d.value.backItems[0]?.goodsId ?? null;
  if (d.value.have.stone === 0) stone.value = false;
}
/** 执行操作；reload=false 用于分解 / 出售（厨具已经没了） */
async function run<T>(fn: () => Promise<T>, fallback: string, reload = true): Promise<T | null> {
  busy.value = true;
  try {
    const r = await fn();
    if (reload) await load();
    return r;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return null;
  } finally {
    busy.value = false;
  }
}

const e = computed(() => d.value?.equip ?? null);
/** 厨具说明（含背景故事，问题记录 134） */
const desc = computed(() => (e.value ? (catalog.goods(e.value.goodsId)?.desc ?? '') : ''));
const freeHoles = computed(() => (e.value ? e.value.curHole - e.value.gems.length : 0));
/** 分解 / 出售的阻挡原因（和服务端一致） */
const blocked = computed(() => {
  const x = e.value;
  if (!x) return '';
  const b = t.value.equip.detail.blocked;
  if (x.locked) return b.locked;
  if (x.worn) return b.worn;
  if (x.gems.length > 0) return b.gems;
  if (x.inPresets.length > 0) return b.preset(x.inPresets.join(activeMessages().events.sep));
  return '';
});

async function stress() {
  const m = t.value.equip.detail;
  const r = await run(() => endpoints.equipStress(id, stone.value), m.stressFailed);
  if (!r) return;
  if (r.success) {
    const extra = `${r.lucky ? m.tags.lucky : ''}${r.floor ? m.tags.floor : ''}`;
    toast.push(m.stressOk(r.stress, ATTR_NAMES[r.attr ?? ''] ?? '', r.val, extra));
  } else toast.push(m.stressMiss, 'info');
}
/** 回退会降强化等级，先确认（问题记录 128） */
async function rollback() {
  const b = d.value?.backItems.find((x) => x.goodsId === backPick.value);
  if (!b || !e.value) return;
  // 服务端最多退到 +0：道具级数比已强化的多时，多的作废（终审）
  const n = Math.min(b.back, e.value.stress);
  const m = t.value.equip.detail;
  if (!window.confirm(m.confirmRollback(catalog.goodsName(b.goodsId), n, b.back - n))) return;
  await run(() => endpoints.equipRollback(id, b.goodsId), m.rollbackFailed);
}
/** 摘除要花银币时先确认并写明多少；免费时直接摘（问题记录 128） */
async function ungem(g: { id: number; level: number }) {
  const coin = g.level * (d.value?.ungemCoinPerLevel ?? 0);
  const m = t.value.equip.detail;
  if (coin > 0 && !window.confirm(m.confirmUngem(formatNum(coin)))) return;
  await run(() => endpoints.equipUngem(g.id), m.ungemFailed);
}
async function salvage() {
  const m = t.value.equip.detail;
  if (!e.value || !window.confirm(m.confirmSalvage(e.value.salvage))) return;
  if ((await run(() => endpoints.equipSalvage(id), m.salvageFailed, false)) !== null)
    await router.push('/rest/equip');
}
async function sell() {
  const m = t.value.equip.detail;
  if (!e.value?.sellPrice || !window.confirm(m.confirmSell(formatNum(e.value.sellPrice)))) return;
  if ((await run(() => endpoints.equipSell(id), m.sellFailed, false)) !== null)
    await router.push('/rest/equip');
}

onMounted(() => load().catch((err) => toast.push(errorMessage(err, t.value.equip.loadFailed), 'danger')));
</script>

<template>
  <div v-if="d && e">
    <!-- 名字一行、部位和等级要求一行，不再挤在同一行里字号不一、底部对齐（问题记录 130） -->
    <h5 class="mb-1">
      {{ equipName(catalog, e) }} <span v-if="e.stress > 0" class="text-success">+{{ e.stress }}</span>
    </h5>
    <div class="dt-meta mb-1" data-testid="equip-meta">
      {{ t.equip.detail.meta(PART_NAMES[e.part] ?? '', e.minLevel, e.worn) }}
    </div>
    <p v-if="desc" class="small text-muted mb-2" data-testid="equip-desc">{{ desc }}</p>

    <table class="table table-sm small">
      <thead>
        <tr>
          <th></th>
          <th v-for="k in ATTR_KEYS" :key="k">{{ ATTR_NAMES[k] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="key in ROWS" :key="key">
          <td>{{ t.equip.detail.rows[key] }}</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ e[key][k] }}</td>
        </tr>
      </tbody>
    </table>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">{{ t.equip.detail.stress }}</div>
      <template v-if="d.rate">
        <div>
          {{ t.equip.detail.rate }} <b>{{ pct(d.rate.total) }}</b>
          <span class="text-muted">{{
            t.equip.detail.rateParts(
              pct(d.rate.base),
              pct(d.rate.luck),
              pct(d.rate.weather),
              pct(d.rate.floor),
            )
          }}</span>
        </div>
        <div v-if="d.next" data-testid="stress-next">
          {{ t.equip.detail.next(d.next.gain, d.next.total) }}
        </div>
        <div>
          {{ t.equip.detail.cost(d.cost.essence, d.have.essence, formatNum(d.cost.coin)) }}
        </div>
        <label class="me-2">
          <input v-model="stone" type="checkbox" :disabled="d.have.stone === 0" data-testid="stone" />
          {{ t.equip.detail.useStone(d.have.stone) }}
        </label>
        <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="stress-go" @click="stress">
          {{ t.equip.detail.stress }}
        </button>
      </template>
      <div v-else class="text-muted">{{ t.equip.detail.maxed }}</div>
      <div v-if="e.stress > 0 && d.backItems.length > 0" class="mt-2 d-flex gap-1 align-items-center">
        <select v-model="backPick" class="form-select form-select-sm w-auto">
          <option v-for="b in d.backItems" :key="b.goodsId" :value="b.goodsId">
            {{ t.equip.detail.backOption(catalog.goodsName(b.goodsId), b.back, b.num) }}
          </option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy || backPick === null"
          data-testid="rollback-go"
          @click="rollback"
        >
          {{ t.equip.detail.rollback }}
        </button>
      </div>
    </div>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">
        {{ t.equip.detail.gems }} <span data-testid="hole-count">{{ e.gems.length }}/{{ e.curHole }}</span>
        <span class="text-muted">{{
          t.equip.detail.holeNote(e.maxHole, d.ungemCoinPerLevel > 0 ? formatNum(d.ungemCoinPerLevel) : null)
        }}</span>
      </div>
      <div v-for="g in e.gems" :key="g.id" class="d-flex align-items-center gap-1">
        <span class="flex-fill">{{ catalog.goodsName(g.goodsId) }}</span>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          :data-testid="`ungem-${g.id}`"
          @click="ungem(g)"
        >
          {{ t.equip.detail.ungem }}
        </button>
      </div>
      <div v-if="freeHoles > 0 && d.gems.length > 0" class="d-flex gap-1 mt-1">
        <select v-model="gemPick" class="form-select form-select-sm w-auto" data-testid="inlay-pick">
          <option v-for="g in d.gems" :key="g.goodsId" :value="g.goodsId">
            {{ t.equip.detail.gemOption(catalog.goodsName(g.goodsId), g.num, g.level) }}
          </option>
        </select>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || gemPick === null"
          data-testid="inlay-go"
          @click="run(() => endpoints.equipInlay(id, gemPick!), t.equip.detail.inlayFailed)"
        >
          {{ t.equip.detail.inlay }}
        </button>
      </div>
      <button
        v-if="e.maxHole > 0 && e.curHole < e.maxHole"
        class="btn btn-sm btn-outline-primary mt-1"
        :disabled="busy"
        data-testid="drill-go"
        @click="run(() => endpoints.equipDrill(id), t.equip.detail.drillFailed)"
      >
        {{ t.equip.detail.drill(d.have.drill) }}
      </button>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2 align-items-center">
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        data-testid="lock-go"
        @click="run(() => endpoints.equipLock(id, !e!.locked), t.common.opFailed)"
      >
        {{ e.locked ? t.equip.detail.unlock : t.equip.detail.lock }}
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="salvage-go"
        @click="salvage"
      >
        {{ t.equip.detail.salvage(e.salvage) }}
      </button>
      <button
        v-if="e.sellPrice !== null"
        class="btn btn-sm btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="sell-go"
        @click="sell"
      >
        {{ t.equip.detail.sell(formatNum(e.sellPrice)) }}
      </button>
      <span v-if="blocked" class="small text-muted">{{ t.equip.detail.blockedNote(blocked) }}</span>
    </div>

    <div v-if="d.history.length > 0" class="small">
      <div class="fw-bold">{{ t.equip.detail.history }}</div>
      <div v-for="(h, i) in d.history" :key="i" :class="h.success ? 'text-success' : 'text-muted'">
        +{{ h.stress }}
        {{
          h.success
            ? t.equip.detail.historyOk(ATTR_NAMES[h.attr ?? ''] ?? '', h.val)
            : t.equip.detail.historyFail
        }}
        {{ h.stone ? t.equip.detail.tags.stone : '' }}{{ h.lucky ? t.equip.detail.tags.lucky : ''
        }}{{ h.floor ? t.equip.detail.tags.floor : '' }}
      </div>
    </div>
  </div>
</template>
