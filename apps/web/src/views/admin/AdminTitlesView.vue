<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { TITLE_DESC_MAX, TITLE_MAX, cleanTitleText, graphemeLen, type AdminTitleDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import { adminShort } from '../../utils/gameInput';
import { useTitleList } from '../../components/admin/titleList';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { useConfirmStore } from '../../stores/confirm';

/**
 * 后台称号页（问题记录 539，定制称号设计 二）：定制称号的新建、改、停用、删；配置称号只读列出。
 * 发放在邮件、兑换码页和玩家页
 */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const titles = useTitleList();
const list = ref<AdminTitleDto[]>([]);
const q = ref('');
const err = ref('');
const busy = ref(false);
const custom = computed(() => list.value.filter((t) => t.source === 'custom'));
const config = computed(() => list.value.filter((t) => t.source !== 'custom'));
const SOURCE: Record<AdminTitleDto['source'], string> = {
  custom: '定制',
  shop: '称号商店',
  kuji: '一番赏',
  fund: '发展基金',
  general: '通用',
};

async function load() {
  try {
    list.value = await adminApi.titles(q.value.trim() || undefined);
    err.value = '';
  } catch (e) {
    err.value = errorMessage(e, '读取称号失败');
  }
}
onMounted(() => {
  void load();
  void titles.load().catch(() => undefined);
});

const count = (s: string) => graphemeLen(cleanTitleText(s));
const nt = ref('');
const nd = ref('');
const nn = ref('');
/** 和全部称号比（backlog 1010：原来只和当前搜索结果比，搜着别的时查不出重名） */
const dup = (title: string, except?: string) => {
  const c = cleanTitleText(title);
  return c !== '' && titles.list.value.some((t) => !t.retired && t.key !== except && t.title === c);
};
const canCreate = computed(
  () => count(nt.value) >= 1 && count(nt.value) <= TITLE_MAX && count(nd.value) <= TITLE_DESC_MAX,
);

async function act(fn: () => Promise<unknown>, done: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(done);
    await load();
    // 邮件、兑换码、玩家页的称号下拉跟着刷新（终审）
    void titles.load(true).catch(() => undefined);
    return true;
  } catch (e) {
    if (e instanceof ApiError && e.params.reason === 'title_in_use')
      err.value = '有人拥有、或有邮件和兑换码引用这个称号，不能删，只能停用';
    else err.value = errorMessage(e, '操作失败');
    return false;
  } finally {
    busy.value = false;
  }
}

async function create() {
  if (!canCreate.value || busy.value) return;
  if (await act(() => adminApi.createTitle({ title: nt.value, desc: nd.value, note: nn.value }), '已新建'))
    nt.value = nd.value = nn.value = '';
}

const editing = ref<number | null>(null);
const et = ref('');
const ed = ref('');
const en = ref('');
function startEdit(t: AdminTitleDto) {
  editing.value = t.id;
  et.value = t.title;
  ed.value = t.desc ?? '';
  en.value = t.note ?? '';
}
async function save(t: AdminTitleDto) {
  if (count(et.value) < 1 || count(et.value) > TITLE_MAX || count(ed.value) > TITLE_DESC_MAX) return;
  if (
    await act(
      () => adminApi.updateTitle(t.id!, { title: et.value, desc: ed.value, note: en.value }),
      '已保存',
    )
  )
    editing.value = null;
}
const toggle = (t: AdminTitleDto) =>
  act(() => adminApi.updateTitle(t.id!, { retired: !t.retired }), t.retired ? '已启用' : '已停用');
async function remove(t: AdminTitleDto) {
  const ok = await confirm.ask({
    title: `删除称号「${t.title}」？`,
    body: '删了找不回来。',
    ok: '删除',
    danger: true,
  });
  if (!ok) return;
  return act(() => adminApi.deleteTitle(t.id!), '已删除');
}
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead
      title="称号"
      desc="定制称号在这里新建; 发给玩家用邮件、兑换码, 或者玩家页直接发。改名字后已经拥有的人也跟着变; 停用后不能再发, 已经拥有的照样保留; 定制称号在所有语言里都显示原文。"
    />
    <div v-if="err" class="dt-adm-alert is-d">
      <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      <div>{{ err }}</div>
    </div>
    <AdmBox v-if="admin.isAdmin" title="新建称号">
      <form @submit.prevent="create">
        <AdmField label="名字" :hint="`1~${TITLE_MAX} 字, 可用 emoji`">
          <div class="dt-adm-line">
            <input v-model="nt" class="dt-adm-in dt-adm-w-lg" data-testid="title-new-title" />
            <span class="dt-adm-mu dt-adm-small">{{ count(nt) }}/{{ TITLE_MAX }}</span>
            <span v-if="dup(nt)" class="dt-adm-warn dt-adm-small">已有同名称号</span>
          </div>
        </AdmField>
        <AdmField label="说明" :hint="`可空, ≤ ${TITLE_DESC_MAX} 字`">
          <input v-model="nd" class="dt-adm-in dt-adm-full" data-testid="title-new-desc" />
        </AdmField>
        <AdmField label="备注" hint="只有后台看">
          <input
            v-model="nn"
            class="dt-adm-in dt-adm-full"
            placeholder="给谁、为什么"
            data-testid="title-new-note"
          />
        </AdmField>
        <AdmField>
          <button
            type="button"
            class="dt-adm-btn is-p"
            :disabled="!canCreate || busy"
            data-testid="title-create"
            @click="create"
          >
            新建
          </button>
        </AdmField>
      </form>
    </AdmBox>

    <form class="dt-adm-fbar" @submit.prevent="load">
      <input
        v-model="q"
        class="dt-adm-in dt-adm-w-lg"
        type="search"
        placeholder="搜名字或备注"
        data-testid="title-q"
      />
      <button type="button" class="dt-adm-btn is-sp" data-testid="title-search" @click="load">搜索</button>
    </form>

    <AdmBox title="定制称号" :sub="`${custom.length} 个`" flush>
      <div class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>键</th>
              <th>名字</th>
              <th>说明</th>
              <th>备注</th>
              <th class="num">拥有</th>
              <th>建的人</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="t in custom"
              :key="t.key"
              :class="{ 'is-off': t.retired, 'is-hl': editing === t.id }"
              :data-testid="`title-row-${t.key}`"
            >
              <td class="dt-adm-mono dt-adm-mu">{{ t.key }}</td>
              <template v-if="editing === t.id">
                <td>
                  <input
                    v-model="et"
                    class="dt-adm-in dt-adm-full"
                    :data-testid="`title-edit-title-${t.id}`"
                  />
                  <div class="dt-adm-help">
                    {{ count(et) }}/{{ TITLE_MAX }}
                    <span v-if="dup(et, t.key)" class="dt-adm-warn">已有同名称号</span>
                  </div>
                </td>
                <td>
                  <input
                    v-model="ed"
                    class="dt-adm-in dt-adm-full"
                    :data-testid="`title-edit-desc-${t.id}`"
                  />
                </td>
                <td>
                  <input
                    v-model="en"
                    class="dt-adm-in dt-adm-full"
                    :data-testid="`title-edit-note-${t.id}`"
                  />
                </td>
              </template>
              <template v-else>
                <td>
                  <span class="dt-adm-chip is-w">{{ t.title }}</span>
                  <span v-if="t.retired" class="dt-adm-tag ms-1">已停用</span>
                </td>
                <td>{{ t.desc ?? '' }}</td>
                <td class="dt-adm-mu">{{ t.note ?? '' }}</td>
              </template>
              <td class="num">{{ t.owners }}</td>
              <td class="dt-adm-mu nowrap">
                {{ t.createdBy ?? '' }} {{ t.createdAt ? adminShort(t.createdAt) : '' }}
              </td>
              <td class="acts">
                <template v-if="admin.isAdmin">
                  <template v-if="editing === t.id">
                    <button
                      type="button"
                      class="dt-adm-btn is-p is-sm"
                      :disabled="busy"
                      :data-testid="`title-save-${t.id}`"
                      @click="save(t)"
                    >
                      保存
                    </button>
                    <button type="button" class="dt-adm-btn is-t is-sm" @click="editing = null">取消</button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="dt-adm-btn is-t is-sm"
                      :data-testid="`title-edit-${t.id}`"
                      @click="startEdit(t)"
                    >
                      改
                    </button>
                    <button
                      type="button"
                      class="dt-adm-btn is-s is-sm"
                      :disabled="busy"
                      :data-testid="`title-retire-${t.id}`"
                      @click="toggle(t)"
                    >
                      {{ t.retired ? '启用' : '停用' }}
                    </button>
                    <button
                      type="button"
                      class="dt-adm-btn is-d is-sm"
                      :disabled="busy"
                      :data-testid="`title-delete-${t.id}`"
                      @click="remove(t)"
                    >
                      删除
                    </button>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AdmEmpty v-if="custom.length === 0" title="还没有定制称号" />
    </AdmBox>

    <AdmBox title="配置称号" sub="只读, 改要走配置" flush>
      <div class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>键</th>
              <th>名字</th>
              <th>说明</th>
              <th>来源</th>
              <th class="num">拥有</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in config" :key="t.key" :data-testid="`conf-row-${t.key}`">
              <td class="dt-adm-mono dt-adm-mu">{{ t.key }}</td>
              <td>{{ t.title }}</td>
              <td>{{ t.desc ?? '' }}</td>
              <td class="dt-adm-mu">{{ SOURCE[t.source] }}</td>
              <td class="num">{{ t.owners }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AdmBox>
  </div>
</template>
