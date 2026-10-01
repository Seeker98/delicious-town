<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { EquipDto, EquipOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AttrPoints from '../components/equip/AttrPoints.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { equipName } from '../utils/equipName';
import { ATTR_KEYS, ATTR_NAMES, PART_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const o = ref<EquipOverviewDto | null>(null);
const part = ref<number | null>(null);
const pieces = ref<EquipDto[]>([]);
const panel = ref<'none' | 'presets' | 'batch'>('none');
const presetName = ref('');
const all = ref<EquipDto[]>([]);
const picked = ref(new Set<number>());
const way = ref<'salvage' | 'sell'>('salvage');
const busy = ref(false);

async function load() {
  o.value = await endpoints.equipOverview();
  if (part.value !== null) pieces.value = await endpoints.equipList(part.value);
}
async function run(fn: () => Promise<unknown>, fallback: string): Promise<boolean> {
  busy.value = true;
  try {
    await fn();
    await load();
    return true;
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return false;
  } finally {
    busy.value = false;
  }
}
const name = (e: EquipDto) => `${equipName(catalog, e)}${e.stress > 0 ? ` +${e.stress}` : ''}`;

async function pick(p: number) {
  part.value = part.value === p ? null : p;
  pieces.value = part.value === null ? [] : await endpoints.equipList(p);
}

async function savePreset() {
  const n = presetName.value.trim();
  if (!n) return;
  if (await run(() => endpoints.equipPresetSave(n), '保存失败')) presetName.value = '';
}
async function applyPreset(id: number) {
  let skipped: number[] = [];
  const ok = await run(async () => {
    skipped = (await endpoints.equipPresetApply(id)).skipped;
  }, '套用失败');
  if (ok && skipped.length > 0)
    toast.push(`等级不够，这些部位留空：${skipped.map((p) => PART_NAMES[p]).join('、')}`, 'info');
}
async function deletePreset(id: number) {
  if (window.confirm('确定删除这个预设吗？')) await run(() => endpoints.equipPresetDelete(id), '删除失败');
}

/** 一键处理只能选"未锁定、未穿戴、没强化、没宝石、不在预设"的；出售还要有价格 */
const candidates = computed(() =>
  all.value.filter(
    (e) =>
      !e.locked &&
      !e.worn &&
      e.stress === 0 &&
      e.gems.length === 0 &&
      e.inPresets.length === 0 &&
      (way.value === 'salvage' || e.sellPrice !== null),
  ),
);
const batchTotal = computed(() =>
  candidates.value
    .filter((e) => picked.value.has(e.id))
    .reduce((s, e) => s + (way.value === 'salvage' ? e.salvage : (e.sellPrice ?? 0)), 0),
);
async function openBatch() {
  panel.value = panel.value === 'batch' ? 'none' : 'batch';
  if (panel.value !== 'batch') return;
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}
function toggle(id: number) {
  const s = new Set(picked.value);
  if (s.has(id)) s.delete(id);
  else s.add(id);
  picked.value = s;
}
async function doBatch() {
  const ids = candidates.value.filter((e) => picked.value.has(e.id)).map((e) => e.id);
  if (ids.length === 0) return;
  const what =
    way.value === 'salvage'
      ? `分解得到 ${batchTotal.value} 精华`
      : `出售得到 ${formatNum(batchTotal.value)} 银币`;
  if (!window.confirm(`处理 ${ids.length} 件厨具，${what}？`)) return;
  await run(() => endpoints.equipBatch(ids, way.value), '处理失败');
  all.value = await endpoints.equipList();
  picked.value = new Set(candidates.value.map((e) => e.id));
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取厨具失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <h5>
      厨具与加点 <small class="text-muted">共 {{ o.count }} 件厨具</small>
    </h5>
    <table class="table table-sm small mb-2">
      <thead>
        <tr>
          <th></th>
          <th v-for="k in ATTR_KEYS" :key="k">{{ ATTR_NAMES[k] }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>加点</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.points[k] }}</td>
        </tr>
        <tr>
          <td>厨具</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.gear[k] }}</td>
        </tr>
        <tr class="fw-bold">
          <td>合计</td>
          <td v-for="k in ATTR_KEYS" :key="k">{{ o.attrs.total[k] }}</td>
        </tr>
      </tbody>
    </table>
    <AttrPoints @done="load" />
    <div class="small mb-2">
      厨力 <b data-testid="power">{{ o.attrs.power }}</b>
      <span class="text-muted">（五项之和 + 幸运/2；厨塔、赛厨榜、好友切磋按它比拼）</span>
    </div>

    <div class="row g-1 mb-2">
      <div v-for="p in [1, 2, 3, 4, 5]" :key="p" class="col">
        <div
          class="border rounded p-1 small text-center"
          :class="{ 'border-primary': part === p }"
          role="button"
          :data-testid="`slot-${p}`"
          @click="pick(p)"
        >
          <div class="text-muted">{{ PART_NAMES[p] }}</div>
          <div v-if="o.worn[p - 1]">{{ name(o.worn[p - 1]!) }}</div>
          <div v-else class="text-muted">空</div>
        </div>
      </div>
    </div>

    <div v-if="part !== null" class="border rounded p-2 mb-2 small">
      <div v-if="pieces.length === 0" class="text-muted">没有这个部位的厨具</div>
      <div v-for="e in pieces" :key="e.id" class="d-flex align-items-center gap-1 border-bottom py-1">
        <RouterLink :to="`/rest/equip/${e.id}`" class="flex-fill">
          {{ name(e) }}
          <span v-if="e.locked" class="bi bi-lock"></span>
          <span class="text-muted ms-1">
            {{
              ATTR_KEYS.filter((k) => e.total[k] > 0)
                .map((k) => `${ATTR_NAMES[k]}${e.total[k]}`)
                .join(' ')
            }}
          </span>
        </RouterLink>
        <span v-if="o.level < e.minLevel" class="text-danger">需要 {{ e.minLevel }} 级</span>
        <button
          v-if="!e.worn"
          class="btn btn-sm btn-primary"
          :disabled="busy || o.level < e.minLevel"
          :data-testid="`wear-${e.id}`"
          @click="run(() => endpoints.equipWear(e.id), '穿戴失败')"
        >
          穿戴
        </button>
        <button
          v-else
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          @click="run(() => endpoints.equipUnwear(e.id), '卸下失败')"
        >
          卸下
        </button>
      </div>
    </div>

    <div v-for="s in o.suits" :key="s.suitId" class="small mb-1">
      <b>{{ s.name }}（{{ s.count }}/{{ s.maxNum }}）</b>
      <span v-for="t in s.tiers" :key="t.need" :class="['ms-2', t.active ? 'text-success' : 'text-muted']">
        {{ t.need }} 件：{{ t.desc }}
      </span>
    </div>

    <div class="d-flex flex-wrap gap-1 my-2">
      <RouterLink to="/rest/gem" class="btn btn-sm btn-outline-primary">宝石</RouterLink>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="open-presets"
        @click="panel = panel === 'presets' ? 'none' : 'presets'"
      >
        预设
      </button>
      <button class="btn btn-sm btn-outline-primary" data-testid="open-batch" @click="openBatch">
        一键处理
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        @click="run(() => endpoints.equipUnwearAll(), '卸下失败')"
      >
        全部卸下
      </button>
    </div>

    <div v-if="panel === 'presets'" class="border rounded p-2 small mb-2">
      <div v-for="p in o.presets" :key="p.id" class="d-flex align-items-center gap-1 border-bottom py-1">
        <span class="flex-fill">{{ p.name }}</span>
        <button
          class="btn btn-sm btn-primary"
          :disabled="busy"
          :data-testid="`preset-apply-${p.id}`"
          @click="applyPreset(p.id)"
        >
          套用
        </button>
        <button class="btn btn-sm btn-outline-danger" :disabled="busy" @click="deletePreset(p.id)">
          删除
        </button>
      </div>
      <div class="d-flex gap-1 mt-2">
        <input
          v-model="presetName"
          maxlength="12"
          class="form-control form-control-sm"
          placeholder="预设名称"
          data-testid="preset-name"
        />
        <button
          class="btn btn-sm btn-primary text-nowrap"
          :disabled="busy"
          data-testid="preset-save"
          @click="savePreset"
        >
          保存当前
        </button>
      </div>
    </div>

    <div v-if="panel === 'batch'" class="border rounded p-2 small mb-2">
      <div class="mb-1">
        <label class="me-2"><input v-model="way" type="radio" value="salvage" /> 分解成精华</label>
        <label><input v-model="way" type="radio" value="sell" /> 出售</label>
      </div>
      <div class="text-muted mb-1">只列出未锁定、未穿戴、没强化、没宝石、不在预设里的厨具</div>
      <div v-for="e in candidates" :key="e.id" :data-testid="`batch-item-${e.id}`">
        <label
          ><input type="checkbox" :checked="picked.has(e.id)" @change="toggle(e.id)" /> {{ name(e) }}</label
        >
      </div>
      <div class="d-flex align-items-center mt-2">
        <span data-testid="batch-total"
          >合计 {{ way === 'salvage' ? `${batchTotal} 精华` : `${formatNum(batchTotal)} 银币` }}</span
        >
        <button
          class="btn btn-sm btn-danger ms-auto"
          :disabled="busy"
          data-testid="batch-go"
          @click="doBatch"
        >
          处理
        </button>
      </div>
    </div>
  </div>
</template>
