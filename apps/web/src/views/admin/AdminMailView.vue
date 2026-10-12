<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MAIL_RESTS_MAX, type AdminMailDto, type RewardItems, type SendMailInput } from '@dt/shared';
import { adminApi } from '../../api/admin';
import RewardItemsEditor from '../../components/admin/RewardItemsEditor.vue';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmSeg from '../../components/admin/kit/AdmSeg.vue';
import { useConfirmStore } from '../../stores/confirm';
import { formatNum } from '../../utils/format';
import { adminShort } from '../../utils/gameInput';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardSummary } from '../../utils/reward';

/** 后台邮件（子项目 6A）：一家或几家店、当前区服、全部区服；附件可带命名帽子、称号（问题记录 539）；撤回 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();

const scope = ref<'rest' | 'shard' | 'all'>('shard');
/** 一家或几家店的 id：逗号、空格、换行分隔，重复的只算一次（每家一封） */
const restInput = ref('');
const restWho = ref<Array<{ id: number; ok: boolean; text: string }>>([]);
const restIds = computed(() => [
  ...new Set(
    restInput.value
      .split(/[\s,，、]+/)
      .filter((x) => /^\d+$/.test(x))
      .map(Number)
      .filter((n) => n > 0),
  ),
]);
const restsOk = computed(
  () =>
    restIds.value.length > 0 &&
    restIds.value.length <= MAIL_RESTS_MAX &&
    restWho.value.every((r) => r.ok) &&
    // 查出来的要正好是现在填的这几家：改了 id、新店名还没回来时不能发（backlog 1010）
    restWho.value.length === restIds.value.length &&
    restWho.value.every((r, i) => r.id === restIds.value[i]),
);
const minLevel = ref<number | ''>('');
const title = ref('');
const body = ref('');
const rewards = ref<RewardItems>({});
const over = ref<string[]>([]);
const formKey = ref(0);
const busy = ref(false);
const list = ref<AdminMailDto[]>([]);

const SCOPE: Record<AdminMailDto['scope'], string> = { rest: '单店', shard: '区服', all: '全部区服' };
const SCOPES = [
  ['rest', '单店'],
  ['shard', '当前区服'],
  ['all', '全部区服'],
] as const;
/** 发送按钮旁边写清发给多少家（界面改版 P12） */
const whoText = computed(() => {
  if (scope.value === 'rest') return `发给 ${restIds.value.length} 家店`;
  const shards = scope.value === 'shard' ? admin.shards.filter((s) => s.id === admin.shardId) : admin.shards;
  const n = shards.reduce((sum, s) => sum + s.restaurants, 0);
  return `发给${scope.value === 'shard' ? (shards[0]?.name ?? '当前区服') : '全部区服'} ${formatNum(n)} 家店`;
});

/** 填店 id 后逐个查出店名、店主，避免发错人（和补偿页同一套做法） */
let whoSeq = 0;
watch(restIds, async (ids) => {
  const seq = ++whoSeq;
  const out = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await adminApi.restaurant(id);
        const other = admin.shardId && r.overview.shardId !== admin.shardId;
        return {
          id,
          ok: !other,
          text: `#${id} ${r.overview.name} · 店主 ${r.owner.username} · ${r.shardName}${other ? ' · 不在当前区服' : ''}`,
        };
      } catch {
        return { id, ok: false, text: `#${id} 找不到这家餐厅（这里填的是餐厅 id）` };
      }
    }),
  );
  if (seq === whoSeq) restWho.value = out;
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
  if (scope.value === 'rest')
    return `发给 ${restIds.value.length} 家店（每家一封）：${restWho.value.map((r) => r.text).join('；')}`;
  if (scope.value === 'shard') return '发给当前区服所有已开的店（之后开的店收不到）';
  return '发给所有区服所有已开的店（之后开的店收不到）';
}

async function send() {
  const shardId = admin.shardId;
  if (!shardId || busy.value) return;
  if (scope.value === 'rest' && !restsOk.value) {
    toast.push(`请检查餐厅 id（最多 ${MAIL_RESTS_MAX} 家）`, 'danger');
    return;
  }
  const attach = Object.keys(rewards.value).length > 0 ? rewardSummary(rewards.value, catalog) : '无附件';
  const ok = await confirm.ask({
    title: `发送「${title.value.trim()}」？`,
    body: `${confirmText()}；附件：${attach}。`,
    ok: '发送',
  });
  if (!ok) return;
  busy.value = true;
  try {
    const b: SendMailInput = {
      scope: scope.value,
      ...(scope.value !== 'all' ? { shardId } : {}),
      ...(scope.value === 'rest' ? { restIds: restIds.value } : {}),
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
  const ok = await confirm.ask({
    title: `撤回「${m.title}」？`,
    body: '没领的人将看不到它, 已领的不追回。',
    ok: '撤回',
    danger: true,
  });
  if (!ok) return;
  try {
    await adminApi.revokeMail(m.id);
    await loadList();
  } catch (e) {
    toast.push(errorMessage(e, '撤回失败'), 'danger');
  }
}
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="邮件" desc="发给一家店、一个区服或全部区服; 附件当场到对方邮箱" />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能发邮件, 你可以查看记录。</div>
    </div>
    <AdmBox v-else title="写一封">
      <form @submit.prevent>
        <AdmField label="发给谁">
          <div class="dt-adm-line">
            <AdmSeg v-model="scope" :options="SCOPES" testid="mail-scope" />
            <input
              v-if="scope === 'rest'"
              v-model="restInput"
              class="dt-adm-in dt-adm-w-md"
              placeholder="餐厅 id, 几家用逗号或空格隔开"
              data-testid="mail-rest"
            />
            <input
              v-model.number="minLevel"
              type="number"
              class="dt-adm-in dt-adm-w-md"
              placeholder="最低等级 (可空, 按领取时算)"
              data-testid="mail-min-level"
            />
          </div>
          <template v-if="scope === 'rest' && restWho.length > 0" #help>
            <div
              v-for="r in restWho"
              :key="r.id"
              :class="r.ok ? 'dt-adm-good' : 'dt-adm-bad'"
              :data-testid="`mail-rest-who-${r.id}`"
            >
              {{ r.text }}
            </div>
          </template>
        </AdmField>
        <AdmField label="标题" hint="≤ 40 字">
          <input v-model="title" class="dt-adm-in dt-adm-full" maxlength="40" data-testid="mail-title" />
        </AdmField>
        <AdmField label="正文" hint="≤ 1000 字">
          <textarea
            v-model="body"
            class="dt-adm-in dt-adm-full"
            rows="3"
            maxlength="1000"
            data-testid="mail-body"
          ></textarea>
        </AdmField>
        <AdmField label="附件" hint="可以不带">
          <RewardItemsEditor
            :key="formKey"
            v-model="rewards"
            :hats="true"
            :icons="true"
            @over="over = $event"
          />
        </AdmField>
        <AdmField>
          <div class="dt-adm-line">
            <button
              type="button"
              class="dt-adm-btn is-p"
              :disabled="
                busy || !title.trim() || !body.trim() || over.length > 0 || (scope === 'rest' && !restsOk)
              "
              data-testid="mail-send"
              @click="send"
            >
              发送…
            </button>
            <span class="dt-adm-mu dt-adm-small">发送前确认: {{ whoText }}</span>
          </div>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="已发出" :sub="`最近 ${list.length} 封`" flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>发给</th>
              <th>标题</th>
              <th>附件</th>
              <th>已领</th>
              <th>发送人</th>
              <th>时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in list" :key="m.id" :class="{ 'is-off': m.revokedAt }">
              <td class="dt-adm-mono dt-adm-mu">{{ m.id }}</td>
              <td class="nowrap">
                {{ SCOPE[m.scope] }}{{ m.restId ? ` ${m.restId}` : ''
                }}{{ m.minLevel ? ` (≥ ${m.minLevel} 级)` : '' }}
              </td>
              <td>{{ m.title }}</td>
              <td>{{ m.items ? rewardSummary(m.items, catalog) : '—' }}</td>
              <td>
                <span :class="['dt-adm-tag', m.claimedCount > 0 ? 'is-ok' : '']">{{
                  m.scope === 'rest' ? `${m.claimedCount} / 1` : `已领 ${m.claimedCount}`
                }}</span>
              </td>
              <td class="dt-adm-mu">{{ m.actor ?? '系统' }}</td>
              <td class="dt-adm-mu nowrap">{{ adminShort(m.createdAt) }}</td>
              <td class="acts">
                <span v-if="m.revokedAt" class="dt-adm-tag">已撤回</span>
                <button
                  v-else-if="admin.isAdmin"
                  type="button"
                  class="dt-adm-btn is-d is-sm"
                  :data-testid="`mail-revoke-${m.id}`"
                  @click="revoke(m)"
                >
                  撤回
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else title="还没有发过邮件" />
      </div>
    </AdmBox>
  </div>
</template>
