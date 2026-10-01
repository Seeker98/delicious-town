<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { AdminMailDto, RewardItems, SendMailInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import RewardItemsEditor from '../../components/admin/RewardItemsEditor.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardSummary } from '../../utils/reward';

/** 后台邮件（子项目 6A）：单店、当前区服、全部区服；附件可带命名帽子；撤回 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();

const scope = ref<'rest' | 'shard' | 'all'>('shard');
const restId = ref<number | ''>('');
const restWho = ref<{ ok: boolean; text: string } | null>(null);
const minLevel = ref<number | ''>('');
const title = ref('');
const body = ref('');
const rewards = ref<RewardItems>({});
const over = ref<string[]>([]);
const formKey = ref(0);
const busy = ref(false);
const list = ref<AdminMailDto[]>([]);

const SCOPE: Record<AdminMailDto['scope'], string> = { rest: '单店', shard: '区服', all: '全部区服' };

/** 填店 id 后查出店名、店主，避免发错人（和补偿页同一套做法） */
let whoSeq = 0;
watch(restId, async () => {
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
      text: `${r.overview.name} · 店主 ${r.owner.username} · ${r.shardName}${other ? ' · 不在当前区服' : ''}`,
    };
  } catch {
    if (seq === whoSeq) restWho.value = { ok: false, text: '找不到这家餐厅（这里填的是餐厅 id）' };
  }
});

async function loadList() {
  try {
    list.value = await adminApi.mails(admin.shardId ?? undefined);
  } catch (e) {
    toast.push(errorMessage(e, '读取邮件失败'), 'danger');
  }
}
onMounted(() => void loadList());
watch(() => admin.shardId, loadList);

function confirmText(): string {
  if (scope.value === 'rest') return `发给 ${restWho.value?.text ?? ''}`;
  if (scope.value === 'shard') return '发给当前区服所有已开的店（之后开的店收不到）';
  return '发给所有区服所有已开的店（之后开的店收不到）';
}

async function send() {
  const shardId = admin.shardId;
  if (!shardId || busy.value) return;
  if (scope.value === 'rest' && !restWho.value?.ok) {
    toast.push(restWho.value?.text ?? '请先填写餐厅 id', 'danger');
    return;
  }
  const attach = Object.keys(rewards.value).length > 0 ? rewardSummary(rewards.value, catalog) : '无附件';
  if (!window.confirm(`${confirmText()}：「${title.value.trim()}」；附件：${attach}。确定吗？`)) return;
  busy.value = true;
  try {
    const b: SendMailInput = {
      scope: scope.value,
      ...(scope.value !== 'all' ? { shardId } : {}),
      ...(scope.value === 'rest' ? { restId: Number(restId.value) } : {}),
      ...(minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
      title: title.value.trim(),
      body: body.value.trim(),
      ...(Object.keys(rewards.value).length > 0 ? { items: rewards.value } : {}),
    };
    await adminApi.sendMail(b);
    toast.push('已发送');
    title.value = '';
    body.value = '';
    rewards.value = {};
    formKey.value++;
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '发送失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function revoke(m: AdminMailDto) {
  if (!window.confirm(`撤回「${m.title}」？没领的人将看不到它，已领的不追回。`)) return;
  try {
    await adminApi.revokeMail(m.id);
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '撤回失败'), 'danger');
  }
}
</script>

<template>
  <h5>邮件</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能发邮件，你可以查看记录。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="send">
    <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <select v-model="scope" class="form-select form-select-sm w-auto" data-testid="mail-scope">
        <option value="rest">单家餐厅</option>
        <option value="shard">当前区服</option>
        <option value="all">全部区服</option>
      </select>
      <input
        v-if="scope === 'rest'"
        v-model.number="restId"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="餐厅 id"
        data-testid="mail-rest"
      />
      <span v-if="scope === 'rest' && restWho" :class="restWho.ok ? 'text-success' : 'text-danger'">{{
        restWho.text
      }}</span>
      <input
        v-model.number="minLevel"
        type="number"
        class="form-control form-control-sm w-auto"
        placeholder="最低等级（可空，按领取时算）"
        data-testid="mail-min-level"
      />
    </div>
    <input
      v-model="title"
      class="form-control form-control-sm mb-2"
      maxlength="40"
      placeholder="标题（≤ 40 字）"
      data-testid="mail-title"
    />
    <textarea
      v-model="body"
      class="form-control form-control-sm mb-2"
      rows="3"
      maxlength="1000"
      placeholder="正文（≤ 1000 字）"
      data-testid="mail-body"
    ></textarea>
    <RewardItemsEditor :key="formKey" v-model="rewards" :hats="true" @over="over = $event" />
    <button
      type="button"
      class="btn btn-primary btn-sm"
      :disabled="busy || !title.trim() || !body.trim() || over.length > 0"
      data-testid="mail-send"
      @click="send"
    >
      发送
    </button>
  </form>

  <table class="table table-sm small">
    <thead>
      <tr>
        <th>#</th>
        <th>范围</th>
        <th>标题</th>
        <th>附件</th>
        <th>已领</th>
        <th>发送人</th>
        <th>时间</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="m in list" :key="m.id" :class="{ 'text-muted': m.revokedAt }">
        <td>{{ m.id }}</td>
        <td>
          {{ SCOPE[m.scope] }}{{ m.restId ? ` ${m.restId}` : ''
          }}{{ m.minLevel ? `（≥${m.minLevel} 级）` : '' }}
        </td>
        <td>{{ m.title }}</td>
        <td>{{ m.items ? rewardSummary(m.items, catalog) : '—' }}</td>
        <td>已领 {{ m.claimedCount }}</td>
        <td>{{ m.actor ?? '系统' }}</td>
        <td>{{ new Date(m.createdAt).toLocaleString('zh-CN') }}</td>
        <td>
          <span v-if="m.revokedAt">已撤回</span>
          <button
            v-else-if="admin.isAdmin"
            type="button"
            class="btn btn-sm btn-outline-danger py-0"
            :data-testid="`mail-revoke-${m.id}`"
            @click="revoke(m)"
          >
            撤回
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>
