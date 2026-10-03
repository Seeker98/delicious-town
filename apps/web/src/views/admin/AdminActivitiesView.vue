<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type {
  ActivityInput,
  ActivityKind,
  AdminActivityDto,
  BoostActivityDef,
  CoopDef,
  ExchangeDef,
  GoalsDef,
  GridDef,
  PassDef,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import GoalsEditor from '../../components/admin/activity/GoalsEditor.vue';
import GridEditor from '../../components/admin/activity/GridEditor.vue';
import BoostEditor from '../../components/admin/activity/BoostEditor.vue';
import CoopEditor from '../../components/admin/activity/CoopEditor.vue';
import ExchangeEditor from '../../components/admin/activity/ExchangeEditor.vue';
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
const formEl = ref<HTMLElement | null>(null);
/** 保存失败时滚到第一处错误并聚焦对应的输入框（问题记录 232）：表单很长，错误常在视野外 */
function focusFirstError() {
  // 错误提示都是 text-danger small；删除按钮也是红字（btn text-danger），要排除
  const el = formEl.value?.querySelector<HTMLElement>('.text-danger.small:not(.btn)');
  if (!el) return;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  const prev = el.previousElementSibling;
  const input = prev?.matches('input, textarea, select')
    ? prev
    : el.parentElement?.querySelector('input, textarea, select');
  (input as HTMLElement | null | undefined)?.focus({ preventScroll: true });
}

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
const defs = ref<{
  goals: GoalsDef;
  grid: GridDef;
  pass: PassDef;
  boost: BoostActivityDef;
  exchange: ExchangeDef;
  coop: CoopDef;
}>({
  goals: defaultDef('goals'),
  grid: defaultDef('grid'),
  pass: defaultDef('pass'),
  boost: defaultDef('boost'),
  exchange: defaultDef('exchange'),
  coop: defaultDef('coop'),
});
const started = computed(() => editing.value !== null && editing.value.state !== 'pending');
/** 已结束（结算中或已补发）：服务端连结束时间也不让改了 */
const ended = computed(
  () => editing.value !== null && (editing.value.state === 'settling' || editing.value.state === 'settled'),
);
const STATE = { pending: '未开始', running: '进行中', settling: '结算中', settled: '已补发' } as const;
/** 兑换活动结束后还有兑换期，玩家仍能兑换，列表不显示"结算中/已补发"（backlog 148-2） */
function stateText(a: AdminActivityDto): string {
  if (a.kind === 'exchange' && (a.state === 'settling' || a.state === 'settled')) {
    const grace = (a.def as ExchangeDef).graceHours * 3_600_000;
    if (Date.now() < new Date(a.endsAt).getTime() + grace) return '兑换中';
  }
  return STATE[a.state];
}
/** 编辑器里没有对应位置的字段错误，显示在表单顶部（backlog 148-1） */
const FIELD = { shardId: '区服', kind: '类型', startsAt: '开始时间', minLevel: '最低等级' } as Record<
  string,
  string
>;
const topErrors = computed(() =>
  Object.entries(errors.value).filter(
    ([k]) => !k.startsWith('def') && !['title', 'body', 'endsAt'].includes(k),
  ),
);
const KIND = {
  goals: '目标清单',
  grid: '九宫格',
  pass: '战令',
  boost: '全服加成',
  exchange: '兑换活动',
  coop: '全服合力',
} as const;

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
  defs.value = {
    goals: defaultDef('goals'),
    grid: defaultDef('grid'),
    pass: defaultDef('pass'),
    boost: defaultDef('boost'),
    exchange: defaultDef('exchange'),
    coop: defaultDef('coop'),
  };
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
  // 没选区服时"当前区服"会变成 null，被当成全服活动建出来（backlog 148-1）
  if (scope.value === 'shard' && !editing.value && admin.shardId === null) {
    errors.value = { shardId: '请先在顶部选择区服，或改成"全服"' };
    await nextTick();
    focusFirstError();
    return;
  }
  const b = {
    shardId: scope.value === 'all' ? null : (editing.value?.shardId ?? admin.shardId ?? null),
    kind: kind.value,
    title: title.value.trim(),
    body: body.value.trim(),
    startsAt: iso(startsAt.value, orig.value?.startsAt),
    endsAt: iso(endsAt.value, orig.value?.endsAt),
    // 全服加成对所有等级生效（148-4 终审 I1）
    minLevel: kind.value === 'boost' ? 1 : minLevel.value,
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
    await nextTick();
    focusFirstError();
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
        <td>{{ stateText(a) }}</td>
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

  <div v-if="open" ref="formEl" class="dt-card">
    <div v-if="ended" class="alert alert-warning py-1 small">活动已结束，只能改标题和说明</div>
    <div v-else-if="started" class="alert alert-warning py-1 small">
      活动已开始，只能改标题、说明和延长结束时间
    </div>
    <div v-for="[k, m] in topErrors" :key="k" class="text-danger small" :data-testid="`err-${k}`">
      {{ FIELD[k] ?? k }}：{{ m }}
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
          <option value="boost">全服加成</option>
          <option value="exchange">兑换活动</option>
          <option value="coop">全服合力</option>
        </select>
      </div>
      <div v-if="kind !== 'boost'" class="col-auto">
        最低等级
        <input
          v-model.number="minLevel"
          data-testid="ac-min-level"
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
      :class="['form-control form-control-sm mb-1', { 'is-invalid': errors.title }]"
      placeholder="标题"
      maxlength="40"
      data-testid="ac-title"
    />
    <div v-if="errors.title" class="text-danger small" data-testid="err-title">{{ errors.title }}</div>
    <textarea
      v-model="body"
      :class="['form-control form-control-sm mb-1', { 'is-invalid': errors.body }]"
      placeholder="说明"
      maxlength="1000"
      data-testid="ac-body"
    ></textarea>
    <div v-if="errors.body" class="text-danger small" data-testid="err-body">{{ errors.body }}</div>
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
        :disabled="ended"
      />
    </div>
    <div v-if="errors.endsAt" class="text-danger small" data-testid="err-endsAt">{{ errors.endsAt }}</div>
    <fieldset :key="formKey" :disabled="started" data-testid="ac-def">
      <GoalsEditor v-if="kind === 'goals'" v-model="defs.goals" :errors="errors" />
      <GridEditor v-else-if="kind === 'grid'" v-model="defs.grid" :errors="errors" />
      <PassEditor v-else-if="kind === 'pass'" v-model="defs.pass" :errors="errors" />
      <BoostEditor v-else-if="kind === 'boost'" v-model="defs.boost" :errors="errors" />
      <ExchangeEditor v-else-if="kind === 'exchange'" v-model="defs.exchange" :errors="errors" />
      <CoopEditor v-else-if="kind === 'coop'" v-model="defs.coop" :errors="errors" />
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
