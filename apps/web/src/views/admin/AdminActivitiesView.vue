<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { ActivityInput, ActivityKind, AdminActivityDto, GoalsDef, GridDef, PassDef } from '@dt/shared';
import { adminApi } from '../../api/admin';
import GoalsEditor from '../../components/admin/activity/GoalsEditor.vue';
import GridEditor from '../../components/admin/activity/GridEditor.vue';
import PassEditor from '../../components/admin/activity/PassEditor.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { defaultDef, issueMap } from '../../utils/activityForm';

/** 后台限时活动（问题记录 148，设计 §7.1） */
const admin = useAdminStore();
const toast = useToastStore();
const list = ref<AdminActivityDto[]>([]);
const busy = ref(false);
const open = ref(false);
const editing = ref<AdminActivityDto | null>(null);
const errors = ref<Record<string, string>>({});

const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const localOf = (isoString: string) => local(new Date(isoString));
const scope = ref<'shard' | 'all'>('shard');
const title = ref('');
const body = ref('');
const startsAt = ref('');
const endsAt = ref('');
const minLevel = ref(1);
const kind = ref<ActivityKind>('goals');
const defs = ref<{ goals: GoalsDef; grid: GridDef; pass: PassDef }>({
  goals: defaultDef('goals'),
  grid: defaultDef('grid'),
  pass: defaultDef('pass'),
});
const started = computed(() => editing.value !== null && editing.value.state !== 'pending');
const STATE = { pending: '未开始', running: '进行中', settling: '结算中', settled: '已补发' } as const;
const KIND = { goals: '目标清单', grid: '九宫格', pass: '战令' } as const;

/** 每次 fill 换一个 key，让奖励编辑器按新活动重新挂载（终审 I1） */
const formKey = ref(0);
/** 服务端给的原始时间：本地输入框只精确到分钟，没改时原样发回（终审 I2） */
const orig = ref<{ startsAt: string; endsAt: string } | null>(null);
const iso = (local: string, original: string | undefined) =>
  original !== undefined && local === localOf(original) ? original : new Date(local).toISOString();

function fill(a: AdminActivityDto | null, copy = false) {
  formKey.value++;
  orig.value = a && !copy ? { startsAt: a.startsAt, endsAt: a.endsAt } : null;
  editing.value = copy ? null : a;
  errors.value = {};
  scope.value = a && a.shardId === null ? 'all' : 'shard';
  title.value = a?.title ?? '';
  body.value = a?.body ?? '';
  minLevel.value = a?.minLevel ?? 1;
  kind.value = a?.kind ?? 'goals';
  defs.value = { goals: defaultDef('goals'), grid: defaultDef('grid'), pass: defaultDef('pass') };
  // a 来自响应式列表，structuredClone 复制不了代理对象，用 JSON 深拷贝
  if (a) (defs.value as Record<ActivityKind, unknown>)[a.kind] = JSON.parse(JSON.stringify(a.def));
  const now = Date.now();
  startsAt.value = a && !copy ? local(new Date(a.startsAt)) : local(new Date(now));
  endsAt.value = a && !copy ? local(new Date(a.endsAt)) : local(new Date(now + 7 * 86_400_000));
  open.value = true;
}

async function load() {
  try {
    list.value = await adminApi.activities();
  } catch (e) {
    toast.push(errorMessage(e, '读取活动失败'), 'danger');
  }
}
onMounted(() => void load());

async function save() {
  if (busy.value) return;
  const b = {
    shardId: scope.value === 'all' ? null : (editing.value?.shardId ?? admin.shardId ?? null),
    kind: kind.value,
    title: title.value.trim(),
    body: body.value.trim(),
    startsAt: iso(startsAt.value, orig.value?.startsAt),
    endsAt: iso(endsAt.value, orig.value?.endsAt),
    minLevel: minLevel.value,
    def: defs.value[kind.value],
  } as ActivityInput;
  busy.value = true;
  errors.value = {};
  try {
    if (editing.value) await adminApi.updateActivity(editing.value.id, b);
    else await adminApi.createActivity(b);
    toast.push('已保存');
    open.value = false;
    await load();
  } catch (e) {
    errors.value = issueMap(e);
    toast.push(errorMessage(e, '保存失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
async function act(fn: () => Promise<unknown>, ok: string, ask: string) {
  if (!window.confirm(ask)) return;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  }
}
</script>

<template>
  <div class="d-flex align-items-center mb-2">
    <h5 class="flex-fill mb-0">限时活动</h5>
    <button type="button" class="btn btn-sm btn-primary" data-testid="ac-new" @click="fill(null)">
      新建
    </button>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>标题</th>
        <th>区服</th>
        <th>类型</th>
        <th>时间</th>
        <th>状态</th>
        <th>参与</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="a in list" :key="a.id">
        <td>{{ a.title }}</td>
        <td>{{ a.shardId ?? '全服' }}</td>
        <td>{{ KIND[a.kind] }}</td>
        <td>{{ new Date(a.startsAt).toLocaleString() }} ~ {{ new Date(a.endsAt).toLocaleString() }}</td>
        <td>{{ STATE[a.state] }}</td>
        <td>{{ a.participants }}</td>
        <td class="text-nowrap">
          <button
            type="button"
            class="btn btn-sm btn-link p-0 me-2"
            :data-testid="`ac-edit-${a.id}`"
            @click="fill(a)"
          >
            编辑
          </button>
          <button type="button" class="btn btn-sm btn-link p-0 me-2" @click="fill(a, true)">复制</button>
          <button
            v-if="a.state === 'running'"
            type="button"
            class="btn btn-sm btn-link p-0 me-2 text-warning"
            @click="act(() => adminApi.endActivity(a.id), '已结束', '确定提前结束这个活动吗？')"
          >
            提前结束
          </button>
          <button
            v-if="a.state === 'pending'"
            type="button"
            class="btn btn-sm btn-link p-0 text-danger"
            @click="act(() => adminApi.deleteActivity(a.id), '已删除', '确定删除吗？')"
          >
            删除
          </button>
        </td>
      </tr>
    </tbody>
  </table>

  <div v-if="open" class="dt-card">
    <div v-if="started" class="alert alert-warning py-1 small">
      活动已开始，只能改标题、说明和延长结束时间
    </div>
    <div class="row g-2 mb-2">
      <div class="col-auto">
        <select v-model="scope" class="form-select form-select-sm" :disabled="started">
          <option value="shard">当前区服</option>
          <option value="all">全服</option>
        </select>
      </div>
      <div class="col-auto">
        <select v-model="kind" class="form-select form-select-sm" data-testid="ac-kind" :disabled="started">
          <option value="goals">目标清单</option>
          <option value="grid">九宫格</option>
          <option value="pass">战令</option>
        </select>
      </div>
      <div class="col-auto">
        最低等级
        <input
          v-model.number="minLevel"
          type="number"
          min="1"
          class="form-control form-control-sm d-inline-block"
          style="width: 5rem"
          :disabled="started"
        />
      </div>
    </div>
    <input
      v-model="title"
      class="form-control form-control-sm mb-1"
      placeholder="标题"
      maxlength="40"
      data-testid="ac-title"
    />
    <div v-if="errors.title" class="text-danger small">{{ errors.title }}</div>
    <textarea
      v-model="body"
      class="form-control form-control-sm mb-1"
      placeholder="说明"
      maxlength="1000"
      data-testid="ac-body"
    ></textarea>
    <div v-if="errors.body" class="text-danger small">{{ errors.body }}</div>
    <div class="d-flex gap-2 align-items-center mb-2 small">
      开始
      <input
        v-model="startsAt"
        type="datetime-local"
        class="form-control form-control-sm w-auto"
        data-testid="ac-starts"
        :disabled="started"
      />
      结束
      <input
        v-model="endsAt"
        type="datetime-local"
        class="form-control form-control-sm w-auto"
        data-testid="ac-ends"
      />
    </div>
    <div v-if="errors.endsAt" class="text-danger small" data-testid="err-endsAt">{{ errors.endsAt }}</div>
    <fieldset :key="formKey" :disabled="started" data-testid="ac-def">
      <GoalsEditor v-if="kind === 'goals'" v-model="defs.goals" :errors="errors" />
      <GridEditor v-else-if="kind === 'grid'" v-model="defs.grid" :errors="errors" />
      <PassEditor v-else v-model="defs.pass" :errors="errors" />
    </fieldset>
    <div class="mt-2">
      <button
        type="button"
        class="btn btn-sm btn-primary me-2"
        :disabled="busy"
        data-testid="ac-save"
        @click="save"
      >
        保存
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary" @click="open = false">取消</button>
    </div>
  </div>
</template>
