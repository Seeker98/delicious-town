<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminAnnouncementDto, AnnouncementInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

/** 后台公告（子项目 6A）：列表、新建、编辑、删除；时间用本地时间输入，提交时转成 ISO */
const admin = useAdminStore();
const toast = useToastStore();
const list = ref<AdminAnnouncementDto[]>([]);
const busy = ref(false);

/** datetime-local 的值（本地时间，到分钟） */
const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const editing = ref<number | null>(null);
/** 正在编辑的公告原来的区服：保存时保持不变，不跟着后台当前区服走（终审 I2） */
const editingShard = ref<number | null>(null);
const scope = ref<'shard' | 'all'>('all');
const title = ref('');
const body = ref('');
const important = ref(false);
const startsAt = ref(local(new Date()));
const endsAt = ref(local(new Date(Date.now() + 7 * 86_400_000)));

function reset() {
  editing.value = null;
  editingShard.value = null;
  scope.value = 'all';
  title.value = '';
  body.value = '';
  important.value = false;
  startsAt.value = local(new Date());
  endsAt.value = local(new Date(Date.now() + 7 * 86_400_000));
}
function edit(a: AdminAnnouncementDto) {
  editing.value = a.id;
  editingShard.value = a.shardId;
  scope.value = a.shardId === null ? 'all' : 'shard';
  title.value = a.title;
  body.value = a.body;
  important.value = a.important;
  startsAt.value = local(new Date(a.startsAt));
  endsAt.value = local(new Date(a.endsAt));
}

async function load() {
  try {
    list.value = await adminApi.announcements();
  } catch (e) {
    toast.push(errorMessage(e, '读取公告失败'), 'danger');
  }
}
onMounted(() => void load());

async function save() {
  if (busy.value) return;
  const b: AnnouncementInput = {
    shardId: scope.value === 'all' ? null : (editingShard.value ?? admin.shardId ?? null),
    title: title.value.trim(),
    body: body.value.trim(),
    important: important.value,
    startsAt: new Date(startsAt.value).toISOString(),
    endsAt: new Date(endsAt.value).toISOString(),
  };
  busy.value = true;
  try {
    if (editing.value === null) await adminApi.createAnnouncement(b);
    else await adminApi.updateAnnouncement(editing.value, b);
    toast.push('已保存');
    reset();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '保存失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function remove(a: AdminAnnouncementDto) {
  if (!window.confirm(`删除公告「${a.title}」？`)) return;
  try {
    await adminApi.deleteAnnouncement(a.id);
    if (editing.value === a.id) reset();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '删除失败'), 'danger');
  }
}
</script>

<template>
  <h5>公告</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能发公告，你可以查看列表。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="save">
    <div class="d-flex flex-wrap gap-2 mb-2 align-items-center">
      <select v-model="scope" class="form-select form-select-sm w-auto" data-testid="an-scope">
        <option value="all">全部区服（登录页也显示）</option>
        <option value="shard" :disabled="admin.shardId === null && editingShard === null">
          {{ editingShard !== null ? `区服 ${editingShard}` : '当前区服' }}
        </option>
      </select>
      <label
        ><input v-model="important" type="checkbox" data-testid="an-important" /> 重要（进游戏弹一次）</label
      >
      <label>开始 <input v-model="startsAt" type="datetime-local" data-testid="an-starts" /></label>
      <label>结束 <input v-model="endsAt" type="datetime-local" data-testid="an-ends" /></label>
    </div>
    <input
      v-model="title"
      class="form-control form-control-sm mb-2"
      maxlength="40"
      placeholder="标题（≤ 40 字）"
      data-testid="an-title"
    />
    <textarea
      v-model="body"
      class="form-control form-control-sm mb-2"
      rows="4"
      maxlength="2000"
      placeholder="正文（≤ 2000 字）"
      data-testid="an-body"
    ></textarea>
    <div class="d-flex gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="busy || !title.trim() || !body.trim()"
        data-testid="an-save"
        @click="save"
      >
        {{ editing === null ? '发布' : '保存修改' }}
      </button>
      <button v-if="editing !== null" type="button" class="btn btn-outline-secondary btn-sm" @click="reset">
        取消编辑
      </button>
    </div>
  </form>

  <table class="table table-sm small">
    <thead>
      <tr>
        <th>#</th>
        <th>标题</th>
        <th>范围</th>
        <th>时间段</th>
        <th>重要</th>
        <th>发布人</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="a in list" :key="a.id">
        <td>{{ a.id }}</td>
        <td>{{ a.title }}</td>
        <td>{{ a.shardId === null ? '全部区服' : `区服 ${a.shardId}` }}</td>
        <td>
          {{ new Date(a.startsAt).toLocaleString('zh-CN') }} ~
          {{ new Date(a.endsAt).toLocaleString('zh-CN') }}
        </td>
        <td>{{ a.important ? '是' : '' }}</td>
        <td>{{ a.actor ?? '—' }}</td>
        <td class="text-nowrap">
          <template v-if="admin.isAdmin">
            <button
              type="button"
              class="btn btn-sm btn-link py-0"
              :data-testid="`an-edit-${a.id}`"
              @click="edit(a)"
            >
              编辑
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger py-0"
              :data-testid="`an-delete-${a.id}`"
              @click="remove(a)"
            >
              删除
            </button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>
