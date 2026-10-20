<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { TITLE_DESC_MAX, TITLE_MAX, TITLE_NOTE_MAX, cleanTitleText, graphemeLen } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { fromGameInput, toGameInput } from '../../utils/gameInput';
import { useTitleList } from './titleList';

/**
 * 选一个称号（定制称号设计 三）：定制的、配置的分组，停用的不出现；可选有效期。
 * create 时可以当场新建一个定制称号（点保存就建好并选中）
 */
type Picked = { key: string; title: string; days?: number; until?: string };
const props = withDefaults(defineProps<{ modelValue: Picked; create?: boolean; testid?: string }>(), {
  create: false,
  testid: 'title',
});
const emit = defineEmits<{ 'update:modelValue': [Picked] }>();
const tid = (s: string) => `${props.testid}-${s}`;

const titles = useTitleList();
onMounted(() => void titles.load().catch(() => undefined));

const q = ref('');
const key = ref(props.modelValue.key);
const mode = ref<'forever' | 'days' | 'until'>(
  props.modelValue.days !== undefined ? 'days' : props.modelValue.until !== undefined ? 'until' : 'forever',
);
const days = ref<number | ''>(props.modelValue.days ?? '');
const until = ref(props.modelValue.until ? toGameInput(new Date(props.modelValue.until)) : '');

const live = computed(() => titles.list.value.filter((t) => !t.retired));
const shown = computed(() => {
  const s = q.value.trim().toLowerCase();
  if (!s) return live.value;
  // 选中的那个总留在下拉里：被搜索滤掉时下拉会显示空白（backlog 1010）
  return live.value.filter(
    (t) =>
      t.key === key.value ||
      t.title.toLowerCase().includes(s) ||
      (t.note ?? '').toLowerCase().includes(s) ||
      t.key === s,
  );
});
/** 按来源分组（backlog：原来只分定制 / 配置两组，每月称号一多就很长） */
const GROUPS: Array<{ source: string; label: string }> = [
  { source: 'custom', label: '定制称号' },
  { source: 'kuji', label: '一番赏' },
  { source: 'shop', label: '商店' },
  { source: 'fund', label: '发展基金' },
  { source: 'general', label: '其他配置称号' },
];
const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, items: shown.value.filter((t) => t.source === g.source) })).filter(
    (g) => g.items.length > 0,
  ),
);
const titleOf = (k: string) => titles.list.value.find((t) => t.key === k)?.title ?? '';

function emitNow() {
  // 改回“选择称号”：外层也清掉（backlog 1010），不留着之前选的
  if (!key.value) {
    emit('update:modelValue', { key: '', title: '' });
    return;
  }
  const out: Picked = { key: key.value, title: titleOf(key.value) };
  // 选了限时却没填：天数给 0、时间给空串，外层据此提示没填完
  if (mode.value === 'days') out.days = days.value === '' ? 0 : Number(days.value);
  if (mode.value === 'until') out.until = until.value ? fromGameInput(until.value) : '';
  emit('update:modelValue', out);
}
watch([key, mode, days, until], emitNow);

// 新建
const making = ref(false);
const nt = ref('');
const nd = ref('');
const nn = ref('');
const busy = ref(false);
const err = ref('');
const count = (s: string) => graphemeLen(cleanTitleText(s));
const dup = computed(() => {
  const c = cleanTitleText(nt.value);
  return c !== '' && live.value.some((t) => t.title === c);
});
const canSave = computed(
  () =>
    count(nt.value) >= 1 &&
    count(nt.value) <= TITLE_MAX &&
    count(nd.value) <= TITLE_DESC_MAX &&
    count(nn.value) <= TITLE_NOTE_MAX,
);
async function save() {
  if (!canSave.value || busy.value) return;
  busy.value = true;
  try {
    const t = await adminApi.createTitle({ title: nt.value, desc: nd.value, note: nn.value });
    titles.add(t);
    key.value = t.key;
    making.value = false;
    nt.value = nd.value = nn.value = err.value = '';
  } catch (e) {
    err.value = errorMessage(e, '新建称号失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-adm-tp">
    <div class="dt-adm-line">
      <input
        v-model="q"
        class="dt-adm-in dt-adm-w-sm"
        type="search"
        placeholder="搜名字或备注"
        :data-testid="tid('q')"
      />
      <select v-model="key" class="dt-adm-in dt-adm-grow" :data-testid="tid('select')">
        <option value="">选择称号</option>
        <optgroup v-for="g in groups" :key="g.source" :label="g.label">
          <option v-for="t in g.items" :key="t.key" :value="t.key">
            <template v-if="t.source === 'custom'">{{ t.title }}{{ t.note ? `（${t.note}）` : '' }}</template>
            <template v-else>{{ t.title }}（{{ t.key }}）</template>
          </option>
        </optgroup>
      </select>
      <select v-model="mode" class="dt-adm-in" :data-testid="tid('mode')">
        <option value="forever">永久</option>
        <option value="days">领取后 N 天</option>
        <option value="until">到某个时间</option>
      </select>
      <input
        v-if="mode === 'days'"
        v-model.number="days"
        type="number"
        min="1"
        max="3650"
        class="dt-adm-in dt-adm-w-sm"
        placeholder="天数（1~3650）"
        :data-testid="tid('days')"
      />
      <input
        v-if="mode === 'until'"
        v-model="until"
        type="datetime-local"
        class="dt-adm-in dt-adm-w-sm"
        :data-testid="tid('until')"
      />
      <span v-if="mode === 'until'" class="dt-adm-mu dt-adm-small">北京时间</span>
      <button
        v-if="create && !making"
        type="button"
        class="dt-adm-btn is-t is-sm"
        :data-testid="tid('new')"
        @click="making = true"
      >
        新建称号
      </button>
    </div>
    <div v-if="making" class="dt-adm-line">
      <input
        v-model="nt"
        class="dt-adm-in dt-adm-w-sm"
        :placeholder="`名字（1~${TITLE_MAX} 字，可用 emoji）`"
        :data-testid="tid('new-title')"
      />
      <span class="dt-adm-mu dt-adm-small" :data-testid="tid('new-count')"
        >{{ count(nt) }}/{{ TITLE_MAX }}</span
      >
      <input
        v-model="nd"
        class="dt-adm-in dt-adm-w-sm"
        :placeholder="`说明（可空，≤ ${TITLE_DESC_MAX} 字）`"
        :data-testid="tid('new-desc')"
      />
      <input
        v-model="nn"
        class="dt-adm-in dt-adm-w-sm"
        placeholder="备注（只有后台看，给谁、为什么）"
        :data-testid="tid('new-note')"
      />
      <button
        type="button"
        class="dt-adm-btn is-p is-sm"
        :disabled="!canSave || busy"
        :data-testid="tid('new-save')"
        @click="save"
      >
        保存
      </button>
      <button type="button" class="dt-adm-btn is-t is-sm" @click="making = false">取消</button>
      <span v-if="dup" class="dt-adm-small dt-adm-warn" :data-testid="tid('dup')">已有同名称号</span>
      <span v-if="err" class="dt-adm-small dt-adm-bad">{{ err }}</span>
    </div>
  </div>
</template>
