<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EquipDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
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
const id = Number(route.params.id);
const d = ref<EquipDetailDto | null>(null);
const stone = ref(false);
const gemPick = ref<number | null>(null);
const backPick = ref<number | null>(null);
const busy = ref(false);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROWS = [
  ['基础', 'base'],
  ['强化', 'boost'],
  ['宝石', 'gem'],
  ['合计', 'total'],
] as const;

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
  if (x.locked) return '已锁定';
  if (x.worn) return '正在穿戴';
  if (x.gems.length > 0) return '镶着宝石';
  if (x.inPresets.length > 0) return `在预设「${x.inPresets.join('、')}」里`;
  return '';
});

async function stress() {
  const r = await run(() => endpoints.equipStress(id, stone.value), '强化失败');
  if (!r) return;
  if (r.success) {
    const extra = `${r.lucky ? '（幸运）' : ''}${r.floor ? '（保底）' : ''}`;
    toast.push(`强化成功 +${r.stress}：${ATTR_NAMES[r.attr ?? ''] ?? ''} +${r.val}${extra}`);
  } else toast.push('强化失败，下次成功率会提高', 'info');
}
/** 回退会降强化等级，先确认（问题记录 128） */
async function rollback() {
  const b = d.value?.backItems.find((x) => x.goodsId === backPick.value);
  if (!b || !e.value) return;
  // 服务端最多退到 +0：道具级数比已强化的多时，多的作废（终审）
  const n = Math.min(b.back, e.value.stress);
  const waste = b.back > n ? `，多出的 ${b.back - n} 级作废` : '';
  if (!window.confirm(`用 1 个${catalog.goodsName(b.goodsId)}回退 ${n} 级强化${waste}，确定吗？`)) return;
  await run(() => endpoints.equipRollback(id, b.goodsId), '回退失败');
}
/** 摘除要花银币时先确认并写明多少；免费时直接摘（问题记录 128） */
async function ungem(g: { id: number; level: number }) {
  const coin = g.level * (d.value?.ungemCoinPerLevel ?? 0);
  if (coin > 0 && !window.confirm(`摘除这颗宝石要花 ${formatNum(coin)} 银币，确定吗？`)) return;
  await run(() => endpoints.equipUngem(g.id), '摘除失败');
}
async function salvage() {
  if (!e.value || !window.confirm(`分解得到 ${e.value.salvage} 个厨具精华，确定吗？`)) return;
  if ((await run(() => endpoints.equipSalvage(id), '分解失败', false)) !== null)
    await router.push('/rest/equip');
}
async function sell() {
  if (!e.value?.sellPrice || !window.confirm(`出售得到 ${formatNum(e.value.sellPrice)} 银币，确定吗？`))
    return;
  if ((await run(() => endpoints.equipSell(id), '出售失败', false)) !== null)
    await router.push('/rest/equip');
}

onMounted(() => load().catch((err) => toast.push(errorMessage(err, '读取厨具失败'), 'danger')));
</script>

<template>
  <div v-if="d && e">
    <!-- 名字一行、部位和等级要求一行，不再挤在同一行里字号不一、底部对齐（问题记录 130） -->
    <h5 class="mb-1">
      {{ equipName(catalog, e) }} <span v-if="e.stress > 0" class="text-success">+{{ e.stress }}</span>
    </h5>
    <div class="dt-meta mb-1" data-testid="equip-meta">
      {{ PART_NAMES[e.part] }} · {{ e.minLevel }} 级可穿{{ e.worn ? ' · 穿戴中' : '' }}
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
        <tr v-for="[label, key] in ROWS" :key="key">
          <td>{{ label }}</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ e[key][k] }}</td>
        </tr>
      </tbody>
    </table>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">强化</div>
      <template v-if="d.rate">
        <div>
          成功率 <b>{{ pct(d.rate.total) }}</b>
          <span class="text-muted"
            >（基础 {{ pct(d.rate.base) }} + 幸运 {{ pct(d.rate.luck) }} + 天气 {{ pct(d.rate.weather) }} +
            保底 {{ pct(d.rate.floor) }}）</span
          >
        </div>
        <div>
          消耗：精华 ×{{ d.cost.essence }}（有 {{ d.have.essence }}）、银币 {{ formatNum(d.cost.coin) }}
        </div>
        <label class="me-2">
          <input v-model="stone" type="checkbox" :disabled="d.have.stone === 0" data-testid="stone" />
          用强化石（必定成功，有 {{ d.have.stone }}）
        </label>
        <button class="btn btn-sm btn-primary" :disabled="busy" data-testid="stress-go" @click="stress">
          强化
        </button>
      </template>
      <div v-else class="text-muted">已经强化到最高</div>
      <div v-if="e.stress > 0 && d.backItems.length > 0" class="mt-2 d-flex gap-1 align-items-center">
        <select v-model="backPick" class="form-select form-select-sm w-auto">
          <option v-for="b in d.backItems" :key="b.goodsId" :value="b.goodsId">
            {{ catalog.goodsName(b.goodsId) }}（回退 {{ b.back }} 级，有 {{ b.num }}）
          </option>
        </select>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy || backPick === null"
          data-testid="rollback-go"
          @click="rollback"
        >
          回退
        </button>
      </div>
    </div>

    <div class="border rounded p-2 mb-2 small">
      <div class="fw-bold mb-1">
        宝石 <span data-testid="hole-count">{{ e.gems.length }}/{{ e.curHole }}</span>
        <span class="text-muted"
          >（最多 {{ e.maxHole }} 孔；{{
            d.ungemCoinPerLevel > 0
              ? `摘除要花 阶数×${formatNum(d.ungemCoinPerLevel)} 银币`
              : '现在摘除免费（2 星以下或酸雨天）'
          }}）</span
        >
      </div>
      <div v-for="g in e.gems" :key="g.id" class="d-flex align-items-center gap-1">
        <span class="flex-fill">{{ catalog.goodsName(g.goodsId) }}</span>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          :data-testid="`ungem-${g.id}`"
          @click="ungem(g)"
        >
          摘除
        </button>
      </div>
      <div v-if="freeHoles > 0 && d.gems.length > 0" class="d-flex gap-1 mt-1">
        <select v-model="gemPick" class="form-select form-select-sm w-auto" data-testid="inlay-pick">
          <option v-for="g in d.gems" :key="g.goodsId" :value="g.goodsId">
            {{ catalog.goodsName(g.goodsId) }}（有 {{ g.num }}，耗体力 {{ g.level }}）
          </option>
        </select>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy || gemPick === null"
          data-testid="inlay-go"
          @click="run(() => endpoints.equipInlay(id, gemPick!), '镶嵌失败')"
        >
          镶嵌
        </button>
      </div>
      <button
        v-if="e.maxHole > 0 && e.curHole < e.maxHole"
        class="btn btn-sm btn-outline-primary mt-1"
        :disabled="busy"
        data-testid="drill-go"
        @click="run(() => endpoints.equipDrill(id), '打孔失败')"
      >
        打孔（打孔石，有 {{ d.have.drill }}）
      </button>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2 align-items-center">
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        data-testid="lock-go"
        @click="run(() => endpoints.equipLock(id, !e!.locked), '操作失败')"
      >
        {{ e.locked ? '解锁' : '锁定' }}
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="salvage-go"
        @click="salvage"
      >
        分解（{{ e.salvage }} 精华）
      </button>
      <button
        v-if="e.sellPrice !== null"
        class="btn btn-sm btn-outline-danger"
        :disabled="busy || !!blocked"
        data-testid="sell-go"
        @click="sell"
      >
        出售（{{ formatNum(e.sellPrice) }}）
      </button>
      <span v-if="blocked" class="small text-muted">{{ blocked }}，不能分解或出售</span>
    </div>

    <div v-if="d.history.length > 0" class="small">
      <div class="fw-bold">强化记录</div>
      <div v-for="(h, i) in d.history" :key="i" :class="h.success ? 'text-success' : 'text-muted'">
        +{{ h.stress }} {{ h.success ? `成功 ${ATTR_NAMES[h.attr ?? ''] ?? ''}+${h.val}` : '失败' }}
        {{ h.stone ? '（强化石）' : '' }}{{ h.lucky ? '（幸运）' : '' }}{{ h.floor ? '（保底）' : '' }}
      </div>
    </div>
  </div>
</template>
