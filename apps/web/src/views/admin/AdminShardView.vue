<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { boostText, type ShardSettingsDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import SettingRow from '../../components/admin/SettingRow.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { getAt, groupOf, leafPaths, removeAt, setAt, type Tree } from '../../utils/settingsTree';
import { matchText } from '../../utils/match';

/** 常用项置顶（设计文档第 5 节） */
const PINNED = [
  'tuning.settlement.expMultiplier',
  'tuning.market.dailyStock',
  'tuning.market.dailyKinds',
  'tuning.market.specialKinds',
  'tuning.rest.atRateBase',
  'restaurant.coin',
  'restaurant.giftFoods',
];

const route = useRoute();
const admin = useAdminStore();
const toast = useToastStore();
const shardId = computed(() => Number(route.params.id));
const data = ref<ShardSettingsDto | null>(null);
const draft = ref<Tree>({});
const note = ref('');
const busy = ref(false);
const badInput = ref(new Set<string>());
/** 写错的原文：标红时仍显示用户输入的内容，不回退成旧值 */
const rawText = ref<Record<string, string>>({});
const badServer = ref(new Set<string>());
const readOnly = computed(() => admin.me?.role !== 'admin');

/** 正在生效的全服加成（148-4）：本页显示的是不含加成的数值，在上方提示；由接口直接给出，不会漏掉早建的 */
const boosts = computed(() => data.value?.boosts ?? []);

async function load() {
  try {
    // 从接口返回的普通对象复制：data.value 是响应式代理，structuredClone 复制代理会抛错
    const res = await adminApi.settings(shardId.value);
    draft.value = structuredClone(res.override) as Tree;
    data.value = res;
    badInput.value = new Set();
    badServer.value = new Set();
  } catch (e) {
    toast.push(errorMessage(e, '读取配置失败'), 'danger');
  }
}
watch(shardId, load, { immediate: true });

const defaults = computed<Tree>(() =>
  data.value ? { restaurant: data.value.defaults.restaurant, tuning: data.value.defaults.tuning } : {},
);
const paths = computed(() => leafPaths(defaults.value));
/**
 * 搜索（问题记录 126）：按字段名、说明或分组说明过滤，不分大小写；有搜索词时匹配的组自动展开。
 * 功能开关也按名字和说明过滤（backlog 6B-2）
 */
const search = ref('');
const docs = computed(() => data.value?.docs ?? { features: {}, groups: {}, fields: {} });
const q = computed(() => search.value.trim());
const hit = (...texts: Array<string | undefined>) =>
  !q.value || texts.some((t) => matchText(t ?? '', q.value));
const match = (p: string) => hit(p, docs.value.fields[p], docs.value.groups[groupOf(p)]);
const features = computed(() =>
  (data.value?.features ?? []).filter((f) => hit(f.name, docs.value.features[f.name])),
);
/** 手动展开的分组：清空搜索后保持展开（backlog 6B-2），搜索时的自动展开不记 */
const opened = ref(new Set<string>());
function onToggle(g: string, e: Event) {
  if (q.value) return;
  const s = new Set(opened.value);
  if ((e.target as HTMLDetailsElement).open) s.add(g);
  else s.delete(g);
  opened.value = s;
}
const pinned = computed(() => PINNED.filter((p) => paths.value.includes(p) && match(p)));
const groups = computed(() => {
  const m = new Map<string, string[]>();
  for (const p of paths.value) {
    if (PINNED.includes(p) || !match(p)) continue;
    const g = groupOf(p);
    m.set(g, [...(m.get(g) ?? []), p]);
  }
  return [...m.entries()];
});

function kindOf(p: string): 'number' | 'boolean' | 'json' {
  const v = getAt(defaults.value, p);
  return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'json';
}
const current = (p: string) => {
  if (badInput.value.has(p) && p in rawText.value) return rawText.value[p];
  const o = getAt(draft.value, p);
  return o === undefined ? getAt(defaults.value, p) : o;
};
const rowProps = (p: string) => ({
  path: p,
  kind: kindOf(p),
  def: getAt(defaults.value, p),
  value: current(p),
  effective: getAt(data.value?.effective, p),
  overridden: getAt(draft.value, p) !== undefined,
  readOnly: readOnly.value,
  error: badInput.value.has(p) || badServer.value.has(p),
  doc: docs.value.fields[p],
});

function mark(p: string, bad: boolean) {
  const s = new Set(badInput.value);
  if (bad) s.add(p);
  else s.delete(p);
  badInput.value = s;
}

function onInput(p: string, e: Event) {
  const el = e.target as HTMLInputElement | HTMLTextAreaElement;
  const kind = kindOf(p);
  let v: unknown;
  if (kind === 'number') {
    if (el.value === '' || !Number.isFinite(Number(el.value))) {
      rawText.value = { ...rawText.value, [p]: el.value };
      return mark(p, true);
    }
    v = Number(el.value);
  } else if (kind === 'boolean') {
    v = (el as HTMLInputElement).checked;
  } else {
    try {
      v = JSON.parse(el.value);
    } catch {
      rawText.value = { ...rawText.value, [p]: el.value };
      return mark(p, true);
    }
  }
  mark(p, false);
  draft.value = setAt(draft.value, p, v);
}

function reset(p: string) {
  mark(p, false);
  draft.value = removeAt(draft.value, p);
}

/** 功能的默认开关：大多默认开，个别默认关（收购 PR 1）；默认值由接口的 defaults.features 给 */
const featureDefault = (name: string) =>
  (data.value?.defaults.features as Record<string, boolean> | undefined)?.[name] !== false;
const featureOn = (name: string) => {
  const o = getAt(draft.value, `features.${name}`);
  return o === undefined ? featureDefault(name) : o !== false;
};
/** 改回默认值时去掉覆盖，和默认不一样时写进覆盖（默认关的功能要写 true 才开） */
function setFeature(name: string, enabled: boolean) {
  draft.value =
    enabled === featureDefault(name)
      ? removeAt(draft.value, `features.${name}`)
      : setAt(draft.value, `features.${name}`, enabled);
}

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(data.value?.override ?? {}));

async function save() {
  if (!data.value) return;
  busy.value = true;
  try {
    await adminApi.saveOverride(shardId.value, {
      override: draft.value,
      note: note.value.trim(),
      version: data.value.version,
    });
    toast.push('已保存，所有进程立即生效');
    note.value = '';
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '保存失败'), 'danger');
    if (e instanceof ApiError && e.code === 'INVALID_CONFIG') {
      const issues = (e.params.issues ?? []) as Array<{ path: string }>;
      badServer.value = new Set(issues.map((i) => i.path));
    }
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data">
    <div v-if="boosts.length" class="alert alert-warning py-1 small" data-testid="boost-hint">
      当前有全服加成生效（下面显示的是不含加成的数值）：
      <span v-for="b in boosts" :key="b.id" class="me-2">
        {{ boostText(b.items) }}（至 {{ new Date(b.endsAt).toLocaleString() }}）
      </span>
    </div>
    <div class="d-flex align-items-center gap-2 mb-2">
      <h5 class="mb-0">区服数值</h5>
      <span class="small text-muted">版本 {{ data.version }}</span>
      <RouterLink :to="`/admin/shards/${shardId}/history`" class="small ms-auto">修改历史</RouterLink>
    </div>
    <p v-if="readOnly" class="small text-muted">你是协管，只能查看。</p>
    <input
      v-model="search"
      class="form-control form-control-sm mb-2"
      placeholder="搜索字段名或说明，比如：经验、菜场"
      data-testid="setting-search"
    />
    <h6 v-if="pinned.length > 0">常用</h6>
    <SettingRow
      v-for="p in pinned"
      :key="p"
      v-bind="rowProps(p)"
      @edit="onInput(p, $event)"
      @reset="reset(p)"
    />
    <h6 v-if="features.length > 0" class="mt-3">功能开关</h6>
    <!-- 功能开关（问题记录 184）：整齐的网格，名字一行、说明一行 -->
    <div class="dt-feature-grid small">
      <label v-for="f in features" :key="f.name" class="dt-feature" :title="docs.features[f.name] ?? ''">
        <span class="d-flex align-items-center">
          <input
            type="checkbox"
            class="form-check-input me-1 mt-0"
            :checked="featureOn(f.name)"
            :disabled="readOnly"
            :data-testid="`feature-${f.name}`"
            @change="setFeature(f.name, ($event.target as HTMLInputElement).checked)"
          />{{ f.name }}
        </span>
        <span
          v-if="docs.features[f.name]"
          class="d-block text-muted"
          :data-testid="`feature-doc-${f.name}`"
          >{{ docs.features[f.name] }}</span
        >
      </label>
    </div>
    <details
      v-for="[g, ps] in groups"
      :key="g"
      class="mt-2"
      :open="q !== '' || opened.has(g) || undefined"
      :data-testid="`group-${g}`"
      @toggle="onToggle(g, $event)"
    >
      <summary>
        {{ g }}（{{ ps.length }}）<span v-if="docs.groups[g]" class="small text-muted ms-1">{{
          docs.groups[g]
        }}</span>
      </summary>
      <SettingRow
        v-for="p in ps"
        :key="p"
        v-bind="rowProps(p)"
        @edit="onInput(p, $event)"
        @reset="reset(p)"
      />
    </details>
    <div v-if="!readOnly" class="sticky-bottom bg-white border-top py-2 mt-3 d-flex gap-2">
      <input
        v-model="note"
        class="form-control form-control-sm"
        placeholder="修改说明（必填）"
        data-testid="save-note"
      />
      <button
        class="btn btn-primary btn-sm text-nowrap"
        data-testid="save-settings"
        :disabled="busy || !dirty || !note.trim() || badInput.size > 0"
        @click="save"
      >
        保存
      </button>
    </div>
  </div>
</template>
