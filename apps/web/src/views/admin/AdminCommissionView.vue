<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  COMMISSION_MEMBERS,
  COMMISSION_NOTICE_MAX,
  type AdminCommissionNoticeDto,
  type CommissionMember,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import commission from '../../i18n/locales/zh-CN/commission';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { adminShort } from '../../utils/gameInput';

/**
 * 委员会公报（小镇委员会 2026-10-16，用户定：后台手动发）：以分管委员的名义说一句规则变了什么，
 * 玩家在委员会页和小镇新闻里看到；不改任何数值。撤回后新闻一起删掉
 */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const list = ref<AdminCommissionNoticeDto[]>([]);
const busy = ref(false);
const scope = ref<'shard' | 'all'>('shard');
const member = ref<CommissionMember>('mayor');
const body = ref('');
const who = (m: CommissionMember) => commission.members[m];
/** 小镇新闻里的样子（和网页简中文案一致） */
const preview = computed(
  () => `【公报】${who(member.value).name} (${who(member.value).role}): ${body.value.trim()}`,
);

async function load() {
  try {
    list.value = await adminApi.commissionNotices();
  } catch (e) {
    toast.push(errorMessage(e, '读取公报失败'), 'danger');
  }
}
onMounted(() => void load());

async function publish() {
  if (busy.value || !body.value.trim()) return;
  const shardId = scope.value === 'all' ? null : admin.shardId;
  if (scope.value === 'shard' && shardId === null) return;
  const ok = await confirm.ask({
    title: `以${who(member.value).name}的名义发公报？`,
    body: `${shardId === null ? '全部区服' : `区服 ${shardId}`}的玩家马上能在委员会页和小镇新闻里看到。`,
    ok: '发布',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await adminApi.createCommissionNotice({ shardId, member: member.value, body: body.value.trim() });
    toast.push('已发布');
    body.value = '';
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '发布失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function remove(n: AdminCommissionNoticeDto) {
  const ok = await confirm.ask({
    title: `撤回公报 #${n.id}？`,
    body: '委员会页和小镇新闻里都会删掉, 不能恢复。',
    ok: '撤回',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi.removeCommissionNotice(n.id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '撤回失败'), 'danger');
  }
}
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead
      title="委员会公报"
      desc="以分管委员的名义说一句规则变了什么; 玩家在委员会页和小镇新闻里看到, 不改任何数值"
    />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能发公报, 你可以查看列表。</div>
    </div>
    <AdmBox v-else title="发一条" sub="发布后马上出现">
      <form @submit.prevent="publish">
        <AdmField label="发到哪">
          <select v-model="scope" class="dt-adm-in" data-testid="cm-scope">
            <option value="shard" :disabled="admin.shardId === null">
              {{ admin.shardId === null ? '当前区服' : `区服 ${admin.shardId}` }}
            </option>
            <option value="all">全部区服</option>
          </select>
        </AdmField>
        <AdmField label="署名" hint="按分管的领域选">
          <div class="dt-adm-line" role="radiogroup" aria-label="署名">
            <button
              v-for="m in COMMISSION_MEMBERS"
              :key="m"
              type="button"
              role="radio"
              :aria-checked="member === m"
              :class="['dt-adm-btn', member === m ? 'is-sp' : 'is-s']"
              :data-testid="`cm-member-${m}`"
              @click="member = m"
            >
              {{ who(m).name }} · {{ who(m).role }}
            </button>
          </div>
        </AdmField>
        <AdmField label="内容" :hint="`≤ ${COMMISSION_NOTICE_MAX} 字, 写玩家看得懂的话; 不自动翻译`">
          <textarea
            v-model="body"
            class="dt-adm-in dt-adm-full"
            rows="3"
            :maxlength="COMMISSION_NOTICE_MAX"
            data-testid="cm-body"
          ></textarea>
          <div class="dt-adm-mu">{{ body.trim().length }} / {{ COMMISSION_NOTICE_MAX }}</div>
        </AdmField>
        <AdmField v-if="body.trim()" label="小镇新闻里">
          <div class="dt-adm-mu" data-testid="cm-preview">{{ preview }}</div>
        </AdmField>
        <AdmField>
          <button
            type="submit"
            class="dt-adm-btn is-p"
            :disabled="busy || !body.trim() || (scope === 'shard' && admin.shardId === null)"
            data-testid="cm-publish"
          >
            发布
          </button>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="已发" :sub="`${list.length} 条`" flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>时间</th>
              <th>范围</th>
              <th>署名</th>
              <th>内容</th>
              <th>发布人</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="n in list" :key="n.id" :class="{ 'is-off': n.deletedAt !== null }">
              <td class="dt-adm-mono dt-adm-mu">{{ n.id }}</td>
              <td class="dt-adm-mu nowrap">{{ adminShort(n.createdAt) }}</td>
              <td class="nowrap">{{ n.shardId === null ? '全部区服' : `区服 ${n.shardId}` }}</td>
              <td class="nowrap">{{ who(n.member).name }}</td>
              <td>{{ n.body }}</td>
              <td class="dt-adm-mu">{{ n.actor ?? '—' }}</td>
              <td>
                <span :class="['dt-adm-tag', n.deletedAt === null ? 'is-ok' : '']">{{
                  n.deletedAt === null ? '已发布' : '已撤回'
                }}</span>
              </td>
              <td class="acts">
                <button
                  v-if="admin.isAdmin && n.deletedAt === null"
                  type="button"
                  class="dt-adm-btn is-d is-sm"
                  :data-testid="`cm-remove-${n.id}`"
                  @click="remove(n)"
                >
                  撤回
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else title="还没有公报" />
      </div>
    </AdmBox>
  </div>
</template>
