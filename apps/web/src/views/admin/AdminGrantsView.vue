<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { GrantDto, GrantItems } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';

const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();

const target = ref<'rest' | 'shard'>('rest');
const restId = ref<number | ''>('');
/** 发给谁：输入餐厅 id 后立即查出店名、店主和区服，避免把账号 id 当成餐厅 id 发错人 */
const restWho = ref<{ ok: boolean; text: string } | null>(null);
const route = useRoute();
let whoSeq = 0;
async function lookupRest() {
  const id = Number(restId.value);
  const seq = ++whoSeq;
  if (!id) {
    restWho.value = null;
    return;
  }
  try {
    const r = await adminApi.restaurant(id);
    if (seq !== whoSeq) return;
    const other = admin.shardId && r.overview.shardId !== admin.shardId;
    restWho.value = {
      ok: !other,
      text: `${r.overview.name} · 店主 ${r.owner.username}（账号 #${r.owner.accountId}）· ${r.shardName}${other ? ' · 不在当前区服' : ''}`,
    };
  } catch {
    if (seq === whoSeq)
      restWho.value = { ok: false, text: '找不到这家餐厅（注意这里填的是餐厅 id，不是账号 id）' };
  }
}
watch(restId, lookupRest);
const minLevel = ref<number | ''>('');
const coin = ref<number | ''>('');
const diamond = ref<number | ''>('');
const exp = ref<number | ''>('');
const goods = ref<Array<{ id: number | ''; num: number | '' }>>([]);
const foods = ref<Array<{ id: number | ''; num: number | '' }>>([]);
const reason = ref('');
const busy = ref(false);
const list = ref<GrantDto[]>([]);
const STATUS: Record<GrantDto['status'], string> = {
  pending: '排队中',
  running: '发放中',
  done: '完成',
  failed: '有失败',
};

function items(): GrantItems {
  const out: GrantItems = {};
  if (coin.value) out.coin = Number(coin.value);
  if (diamond.value) out.diamond = Number(diamond.value);
  if (exp.value) out.exp = Number(exp.value);
  const lines = (rows: Array<{ id: number | ''; num: number | '' }>) =>
    rows.filter((r) => r.id && r.num).map((r) => ({ id: Number(r.id), num: Number(r.num) }));
  if (lines(goods.value).length > 0) out.goods = lines(goods.value);
  if (lines(foods.value).length > 0) out.foods = lines(foods.value);
  return out;
}

function summary(i: GrantItems): string {
  const parts: string[] = [];
  if (i.coin) parts.push(`银币 ${i.coin}`);
  if (i.diamond) parts.push(`钻石 ${i.diamond}`);
  if (i.exp) parts.push(`经验 ${i.exp}`);
  for (const g of i.goods ?? []) parts.push(`${catalog.goodsName(g.id)}×${g.num}`);
  for (const f of i.foods ?? []) parts.push(`${catalog.foodName(f.id)}×${f.num}`);
  return parts.join('、');
}

async function loadList() {
  try {
    list.value = await adminApi.grants(admin.shardId ?? undefined);
  } catch (e) {
    toast.push(errorMessage(e, '读取记录失败'), 'danger');
  }
}

async function submit() {
  const shardId = admin.shardId;
  if (!shardId) return;
  busy.value = true;
  try {
    if (target.value === 'rest') {
      if (!restWho.value?.ok) {
        toast.push(restWho.value?.text ?? '请先填写餐厅 id', 'danger');
        return;
      }
      if (!window.confirm(`发给 ${restWho.value.text}：${summary(items())}。确定吗？`)) return;
    }
    if (target.value === 'shard') {
      const { count } = await adminApi.grantPreview(
        shardId,
        minLevel.value ? Number(minLevel.value) : undefined,
      );
      if (!window.confirm(`将发给 ${count} 家店：${summary(items())}。确定吗？`)) return;
    }
    const g = await adminApi.createGrant({
      shardId,
      target: target.value,
      ...(target.value === 'rest' ? { restId: Number(restId.value) } : {}),
      ...(target.value === 'shard' && minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
      items: items(),
      reason: reason.value.trim(),
    });
    toast.push(g.status === 'done' ? '已到账' : '已排队，worker 会分批发放');
    coin.value = diamond.value = exp.value = '';
    goods.value = [];
    foods.value = [];
    reason.value = '';
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '发放失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  const q = Number(route.query.restId);
  if (q) restId.value = q;
  void loadList();
  timer = setInterval(() => {
    if (list.value.some((g) => g.status === 'pending' || g.status === 'running')) void loadList();
  }, 5000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
watch(() => admin.shardId, loadList);
</script>

<template>
  <h5>发放补偿</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能发放，你可以查看记录。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="submit">
    <div class="d-flex flex-wrap gap-3 mb-2">
      <label
        ><input v-model="target" type="radio" value="rest" data-testid="grant-target-rest" /> 单家餐厅</label
      >
      <label
        ><input v-model="target" type="radio" value="shard" data-testid="grant-target-shard" />
        当前区服所有餐厅</label
      >
      <input
        v-if="target === 'rest'"
        v-model.number="restId"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="餐厅 id"
        data-testid="grant-rest"
      />
      <span
        v-if="target === 'rest' && restWho"
        class="align-self-center"
        :class="restWho.ok ? 'text-success' : 'text-danger'"
        data-testid="grant-rest-who"
        >{{ restWho.text }}</span
      >
      <input
        v-else
        v-model.number="minLevel"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="最低等级（可空）"
        data-testid="grant-min-level"
      />
    </div>
    <div class="d-flex flex-wrap gap-2 mb-2">
      <input
        v-model.number="coin"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="银币"
        data-testid="grant-coin"
      />
      <input
        v-model.number="diamond"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="钻石"
      />
      <input
        v-model.number="exp"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="经验"
      />
    </div>
    <div v-for="(g, i) in goods" :key="`g${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <input
        v-model.number="g.id"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="道具 id"
        :data-testid="`grant-goods-id-${i}`"
      />
      <input
        v-model.number="g.num"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="数量"
        :data-testid="`grant-goods-num-${i}`"
      />
      <span class="text-muted">{{ g.id ? catalog.goodsName(Number(g.id)) : '' }}</span>
    </div>
    <div v-for="(f, i) in foods" :key="`f${i}`" class="d-flex gap-2 mb-1 align-items-center">
      <input
        v-model.number="f.id"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="食材 id"
      />
      <input
        v-model.number="f.num"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="数量"
      />
      <span class="text-muted">{{ f.id ? catalog.foodName(Number(f.id)) : '' }}</span>
    </div>
    <div class="d-flex gap-2 mb-2">
      <button
        type="button"
        class="btn btn-link btn-sm p-0"
        data-testid="grant-add-goods"
        @click="goods.push({ id: '', num: 1 })"
      >
        + 道具
      </button>
      <button type="button" class="btn btn-link btn-sm p-0" @click="foods.push({ id: '', num: 1 })">
        + 食材
      </button>
    </div>
    <div class="d-flex gap-2">
      <input
        v-model="reason"
        class="form-control form-control-sm"
        placeholder="原因（玩家日志里能看到）"
        data-testid="grant-reason"
      />
      <button class="btn btn-primary btn-sm text-nowrap" :disabled="busy || !reason.trim()">发放</button>
    </div>
  </form>

  <table class="table table-sm small">
    <thead>
      <tr>
        <th>#</th>
        <th>对象</th>
        <th>内容</th>
        <th>原因</th>
        <th>状态</th>
        <th>进度</th>
        <th>操作人</th>
        <th>时间</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="g in list" :key="g.id">
        <td>{{ g.id }}</td>
        <td>
          {{
            g.target === 'rest' ? `餐厅 ${g.restId}` : `全区服${g.minLevel ? `（≥${g.minLevel} 级）` : ''}`
          }}
        </td>
        <td>{{ summary(g.items) }}</td>
        <td>{{ g.reason }}</td>
        <td :class="{ 'text-danger': g.status === 'failed' }">{{ STATUS[g.status] }}</td>
        <td>
          {{ g.doneCount }}/{{ g.total
          }}<span v-if="g.failedCount" class="text-danger">（失败 {{ g.failedCount }}）</span>
        </td>
        <td>{{ g.actor ?? '—' }}</td>
        <td>{{ new Date(g.createdAt).toLocaleString('zh-CN') }}</td>
      </tr>
    </tbody>
  </table>
</template>
