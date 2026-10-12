<script setup lang="ts">
import { adminShort, fromGameInput, toGameInput } from '../../utils/gameInput';
import { onMounted, ref } from 'vue';
import type { AdminAnnouncementDto, AnnouncementInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { periodText, periodTone } from '../../utils/adminLabels';
import { useConfirmStore } from '../../stores/confirm';

/** 后台公告（子项目 6A）：列表、新建、编辑、删除；时间用本地时间输入，提交时转成 ISO */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const list = ref<AdminAnnouncementDto[]>([]);
const busy = ref(false);

/** datetime-local 的值（北京时间，到分钟；终审：不跟着设备时区） */
const local = toGameInput;
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
    startsAt: fromGameInput(startsAt.value),
    endsAt: fromGameInput(endsAt.value),
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
  const ok = await confirm.ask({
    title: `删除公告「${a.title}」？`,
    body: '删掉后玩家马上看不到, 不能恢复。',
    ok: '删除',
    danger: true,
  });
  if (!ok) return;
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
  <div class="dt-adm-page">
    <AdmHead title="公告" desc="登录页和游戏里的公告; 重要的进游戏弹一次" />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能发公告, 你可以查看列表。</div>
    </div>
    <AdmBox v-else :title="editing === null ? '写一条' : `修改 #${editing}`">
      <form @submit.prevent="save">
        <AdmField label="发到哪">
          <div class="dt-adm-line">
            <select v-model="scope" class="dt-adm-in" data-testid="an-scope">
              <option value="all">全部区服（登录页也显示）</option>
              <option value="shard" :disabled="admin.shardId === null && editingShard === null">
                {{ editingShard !== null ? `区服 ${editingShard}` : '当前区服' }}
              </option>
            </select>
            <label class="dt-adm-check"
              ><input v-model="important" type="checkbox" data-testid="an-important" />
              重要（进游戏弹一次）</label
            >
          </div>
        </AdmField>
        <AdmField label="时间段" hint="北京时间">
          <div class="dt-adm-line">
            <input
              v-model="startsAt"
              type="datetime-local"
              class="dt-adm-in"
              aria-label="开始"
              data-testid="an-starts"
            />
            <span class="dt-adm-mu">–</span>
            <input
              v-model="endsAt"
              type="datetime-local"
              class="dt-adm-in"
              aria-label="结束"
              data-testid="an-ends"
            />
          </div>
        </AdmField>
        <AdmField label="标题" hint="≤ 40 字">
          <input v-model="title" class="dt-adm-in dt-adm-full" maxlength="40" data-testid="an-title" />
        </AdmField>
        <AdmField label="正文" hint="≤ 2000 字">
          <textarea
            v-model="body"
            class="dt-adm-in dt-adm-full"
            rows="4"
            maxlength="2000"
            data-testid="an-body"
          ></textarea>
        </AdmField>
        <AdmField>
          <div class="dt-adm-line">
            <button
              type="button"
              class="dt-adm-btn is-p"
              :disabled="busy || !title.trim() || !body.trim()"
              data-testid="an-save"
              @click="save"
            >
              {{ editing === null ? '发布' : '保存修改' }}
            </button>
            <button v-if="editing !== null" type="button" class="dt-adm-btn is-s" @click="reset">
              取消编辑
            </button>
          </div>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="全部公告" :sub="`${list.length} 条`" flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>标题</th>
              <th>范围</th>
              <th>时间段</th>
              <th>状态</th>
              <th>发布人</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in list" :key="a.id" :class="{ 'is-hl': editing === a.id }">
              <td class="dt-adm-mono dt-adm-mu">{{ a.id }}</td>
              <td>{{ a.title }} <span v-if="a.important" class="dt-adm-tag is-w">重要</span></td>
              <td class="nowrap">{{ a.shardId === null ? '全部区服' : `区服 ${a.shardId}` }}</td>
              <td class="dt-adm-mu nowrap">{{ adminShort(a.startsAt) }} – {{ adminShort(a.endsAt) }}</td>
              <td>
                <span :class="['dt-adm-tag', periodTone(a.startsAt, a.endsAt)]">{{
                  periodText(a.startsAt, a.endsAt)
                }}</span>
              </td>
              <td class="dt-adm-mu">{{ a.actor ?? '—' }}</td>
              <td class="acts">
                <template v-if="admin.isAdmin">
                  <button
                    type="button"
                    class="dt-adm-btn is-t is-sm"
                    :data-testid="`an-edit-${a.id}`"
                    @click="edit(a)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="dt-adm-btn is-d is-sm"
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
        <AdmEmpty v-else title="还没有公告" />
      </div>
    </AdmBox>
  </div>
</template>
