<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LINK_NAME_MAX, LINK_NOTE_MAX, LINK_URL_MAX, type AdminLinkDto, type LinkInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

/** 后台友情链接（问题记录 348）：列表、新建、编辑、删除；排序小的在前 */
const admin = useAdminStore();
const toast = useToastStore();
const list = ref<AdminLinkDto[]>([]);
const busy = ref(false);
const editing = ref<number | null>(null);
const name = ref('');
const url = ref('');
const note = ref('');
const sort = ref(0);

function reset() {
  editing.value = null;
  name.value = '';
  url.value = '';
  note.value = '';
  sort.value = 0;
}
function edit(l: AdminLinkDto) {
  editing.value = l.id;
  name.value = l.name;
  url.value = l.url;
  note.value = l.note;
  sort.value = l.sort;
}

async function load() {
  try {
    list.value = await adminApi.links();
  } catch (e) {
    toast.push(errorMessage(e, '读取友情链接失败'), 'danger');
  }
}
onMounted(() => void load());

async function save() {
  if (busy.value) return;
  const b: LinkInput = {
    name: name.value.trim(),
    url: url.value.trim(),
    note: note.value.trim(),
    sort: Number(sort.value),
  };
  busy.value = true;
  try {
    if (editing.value === null) await adminApi.createLink(b);
    else await adminApi.updateLink(editing.value, b);
    toast.push('已保存');
    reset();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '保存失败（地址要以 http:// 或 https:// 开头）'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function remove(l: AdminLinkDto) {
  if (!window.confirm(`删除友情链接「${l.name}」？`)) return;
  try {
    await adminApi.deleteLink(l.id);
    if (editing.value === l.id) reset();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '删除失败'), 'danger');
  }
}
</script>

<template>
  <h5>友情链接</h5>
  <p v-if="!admin.isAdmin" class="small text-muted">只有管理员能改友情链接，你可以查看列表。</p>
  <form v-else class="small border rounded p-2 mb-3" @submit.prevent="save">
    <div class="d-flex flex-wrap gap-2 mb-2">
      <input
        v-model="name"
        class="form-control form-control-sm w-auto"
        :maxlength="LINK_NAME_MAX"
        :placeholder="`名字（≤ ${LINK_NAME_MAX} 字）`"
        data-testid="ln-name"
      />
      <input
        v-model="url"
        class="form-control form-control-sm flex-fill"
        :maxlength="LINK_URL_MAX"
        placeholder="地址（https://…）"
        data-testid="ln-url"
      />
      <label class="d-flex align-items-center gap-1"
        >排序
        <input
          v-model.number="sort"
          type="number"
          class="form-control form-control-sm"
          style="width: 80px"
          data-testid="ln-sort"
      /></label>
    </div>
    <input
      v-model="note"
      class="form-control form-control-sm mb-2"
      :maxlength="LINK_NOTE_MAX"
      :placeholder="`一句介绍（可空，≤ ${LINK_NOTE_MAX} 字）`"
      data-testid="ln-note"
    />
    <div class="d-flex gap-2">
      <button
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="busy || !name.trim() || !url.trim()"
        data-testid="ln-save"
        @click="save"
      >
        {{ editing === null ? '添加' : '保存修改' }}
      </button>
      <button v-if="editing !== null" type="button" class="btn btn-outline-secondary btn-sm" @click="reset">
        取消编辑
      </button>
    </div>
  </form>

  <table class="table table-sm small">
    <thead>
      <tr>
        <th>排序</th>
        <th>名字</th>
        <th>地址</th>
        <th>介绍</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="l in list" :key="l.id">
        <td>{{ l.sort }}</td>
        <td>{{ l.name }}</td>
        <td class="text-break">{{ l.url }}</td>
        <td>{{ l.note }}</td>
        <td class="text-nowrap">
          <template v-if="admin.isAdmin">
            <button
              type="button"
              class="btn btn-sm btn-link py-0"
              :data-testid="`ln-edit-${l.id}`"
              @click="edit(l)"
            >
              编辑
            </button>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger py-0"
              :data-testid="`ln-delete-${l.id}`"
              @click="remove(l)"
            >
              删除
            </button>
          </template>
        </td>
      </tr>
    </tbody>
  </table>
</template>
