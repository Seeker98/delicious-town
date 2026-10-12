<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LINK_NAME_MAX, LINK_NOTE_MAX, LINK_URL_MAX, type AdminLinkDto, type LinkInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 后台友情链接（问题记录 348）：列表、新建、编辑、删除；排序小的在前 */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
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
  const ok = await confirm.ask({ title: `删除友情链接「${l.name}」？`, ok: '删除', danger: true });
  if (!ok) return;
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
  <div class="dt-adm-page">
    <AdmHead title="友情链接" desc="帮助中心底部的友情链接; 排序小的在前" />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能改友情链接, 你可以查看列表。</div>
    </div>
    <AdmBox v-else :title="editing === null ? '加一个' : `修改 #${editing}`">
      <form @submit.prevent="save">
        <AdmField label="名字" :hint="`≤ ${LINK_NAME_MAX} 字`">
          <input
            v-model="name"
            class="dt-adm-in dt-adm-w-lg"
            :maxlength="LINK_NAME_MAX"
            data-testid="ln-name"
          />
        </AdmField>
        <AdmField label="地址">
          <input
            v-model="url"
            class="dt-adm-in dt-adm-full"
            :maxlength="LINK_URL_MAX"
            placeholder="https://…"
            data-testid="ln-url"
          />
        </AdmField>
        <AdmField label="介绍" :hint="`可空, ≤ ${LINK_NOTE_MAX} 字`">
          <input
            v-model="note"
            class="dt-adm-in dt-adm-full"
            :maxlength="LINK_NOTE_MAX"
            data-testid="ln-note"
          />
        </AdmField>
        <AdmField label="排序" hint="小的在前">
          <input v-model.number="sort" type="number" class="dt-adm-in dt-adm-w-xs" data-testid="ln-sort" />
        </AdmField>
        <AdmField>
          <div class="dt-adm-line">
            <button
              type="button"
              class="dt-adm-btn is-p"
              :disabled="busy || !name.trim() || !url.trim()"
              data-testid="ln-save"
              @click="save"
            >
              {{ editing === null ? '添加' : '保存修改' }}
            </button>
            <button v-if="editing !== null" type="button" class="dt-adm-btn is-s" @click="reset">
              取消编辑
            </button>
          </div>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="全部链接" :sub="`${list.length} 个`" flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th class="num">排序</th>
              <th>名字</th>
              <th>地址</th>
              <th>介绍</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in list" :key="l.id" :class="{ 'is-hl': editing === l.id }">
              <td class="num dt-adm-mu">{{ l.sort }}</td>
              <td>{{ l.name }}</td>
              <td class="dt-adm-mono dt-adm-break">{{ l.url }}</td>
              <td class="dt-adm-mu">{{ l.note }}</td>
              <td class="acts">
                <template v-if="admin.isAdmin">
                  <button
                    type="button"
                    class="dt-adm-btn is-t is-sm"
                    :data-testid="`ln-edit-${l.id}`"
                    @click="edit(l)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="dt-adm-btn is-d is-sm"
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
        <AdmEmpty v-else title="还没有友情链接" />
      </div>
    </AdmBox>
  </div>
</template>
