<script setup lang="ts">
import { adminShort } from '../../utils/gameInput';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { GrantDto, GrantItems, RewardItems } from '@dt/shared';
import { adminApi } from '../../api/admin';
import RewardItemsEditor from '../../components/admin/RewardItemsEditor.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardSummary } from '../../utils/reward';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmField from '../../components/admin/kit/AdmField.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmSeg from '../../components/admin/kit/AdmSeg.vue';
import { useConfirmStore } from '../../stores/confirm';

const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();

const target = ref<'rest' | 'shard'>('rest');
const restId = ref<number | ''>('');
/** 发给谁：输入餐厅 id 后立即查出店名、店主和区服，避免把账号 id 当成餐厅 id 发错人 */
const restWho = ref<{ ok: boolean; text: string } | null>(null);
const route = useRoute();
let whoSeq = 0;
/** 按店名或用户名查餐厅 id（问题记录：不知道餐厅 id 在哪查）；只列当前区服的店 */
const searchQ = ref('');
const hits = ref<Array<{ id: number; name: string; shardName: string; owner: string; level: number }>>([]);
async function searchRest() {
  const q = searchQ.value.trim();
  if (!q) return;
  try {
    const players = await adminApi.searchPlayers(q);
    hits.value = players.flatMap((p) =>
      p.restaurants
        .filter((r) => !admin.shardId || r.shardId === admin.shardId)
        .map((r) => ({ id: r.id, name: r.name, shardName: r.shardName, owner: p.username, level: r.level })),
    );
    if (hits.value.length === 0) toast.push('当前区服没有找到匹配的餐厅', 'danger');
  } catch (e) {
    toast.push(errorMessage(e, '查询失败'), 'danger');
  }
}
function pickRest(id: number) {
  restId.value = id;
  hits.value = [];
}
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
/** 附件（编辑器输出）；清空时换 key 让编辑器重新挂载 */
const rewards = ref<RewardItems>({});
const over = ref<string[]>([]);
const formKey = ref(0);
/** 改为发邮件：玩家在邮箱里领取（子项目 6A） */
const asMail = ref(false);
const reason = ref('');
const busy = ref(false);
const list = ref<GrantDto[]>([]);
const TARGETS = [
  ['rest', '单家餐厅'],
  ['shard', '当前区服所有餐厅'],
] as const;
const STATUS_TONE: Record<GrantDto['status'], string> = {
  pending: 'is-w',
  running: 'is-p',
  done: 'is-ok',
  failed: 'is-d',
};
const STATUS: Record<GrantDto['status'], string> = {
  pending: '排队中',
  running: '发放中',
  done: '完成',
  failed: '有失败',
};

const items = (): GrantItems => rewards.value;
const summary = (i: GrantItems) => rewardSummary(i, catalog);

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
      const ok = await confirm.ask({
        title: '发放补偿？',
        body: `发给 ${restWho.value.text}：${summary(items())}。`,
        ok: '发放',
      });
      if (!ok) return;
    }
    if (target.value === 'shard') {
      const { count } = await adminApi.grantPreview(
        shardId,
        minLevel.value ? Number(minLevel.value) : undefined,
      );
      const ok = await confirm.ask({
        title: `发给 ${count} 家店？`,
        body: `将发给 ${count} 家店：${summary(items())}。`,
        ok: '发放',
      });
      if (!ok) return;
    }
    const g = await adminApi.createGrant({
      shardId,
      target: target.value,
      ...(target.value === 'rest' ? { restId: Number(restId.value) } : {}),
      ...(target.value === 'shard' && minLevel.value ? { minLevel: Number(minLevel.value) } : {}),
      items: items(),
      reason: reason.value.trim(),
      ...(asMail.value ? { asMail: true } : {}),
    });
    toast.push(
      asMail.value
        ? '已发邮件，玩家在邮箱里领取'
        : g.status === 'done'
          ? '已到账'
          : '已排队，worker 会分批发放',
    );
    rewards.value = {};
    formKey.value++;
    asMail.value = false;
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
  <div class="dt-adm-page">
    <AdmHead title="补偿" desc="直接发到店里; 也可以改为发邮件让玩家自己领" />
    <div v-if="!admin.isAdmin" class="dt-adm-alert is-p">
      <i class="bi bi-eye" aria-hidden="true"></i>
      <div>只有管理员能发放, 你可以查看记录。</div>
    </div>
    <AdmBox v-else title="发一次">
      <form @submit.prevent="submit">
        <AdmField label="发给谁">
          <div class="dt-adm-line">
            <AdmSeg v-model="target" :options="TARGETS" testid="grant-target" />
            <input
              v-if="target === 'rest'"
              v-model.number="restId"
              type="number"
              class="dt-adm-in dt-adm-w-sm"
              placeholder="餐厅 id"
              data-testid="grant-rest"
            />
            <input
              v-else
              v-model.number="minLevel"
              type="number"
              class="dt-adm-in dt-adm-w-md"
              placeholder="最低等级 (可空)"
              data-testid="grant-min-level"
            />
          </div>
          <template v-if="target === 'rest'" #help>
            <div
              v-if="restWho"
              :class="restWho.ok ? 'dt-adm-good' : 'dt-adm-bad'"
              data-testid="grant-rest-who"
            >
              {{ restWho.text }}
            </div>
            <div class="dt-adm-line dt-adm-mt-sm">
              <input
                v-model="searchQ"
                class="dt-adm-in dt-adm-w-md"
                placeholder="不知道 id? 按店名或用户名查"
                data-testid="grant-search"
                @keydown.enter.prevent="searchRest"
              />
              <button type="button" class="dt-adm-btn is-s" data-testid="grant-search-go" @click="searchRest">
                查找
              </button>
            </div>
            <div v-if="hits.length > 0" class="dt-adm-line dt-adm-mt-sm">
              <button
                v-for="h in hits"
                :key="h.id"
                type="button"
                class="dt-adm-btn is-sp is-sm"
                :data-testid="`grant-pick-${h.id}`"
                @click="pickRest(h.id)"
              >
                {{ h.name }} #{{ h.id }} · {{ h.owner }} · {{ h.level }} 级
              </button>
            </div>
          </template>
        </AdmField>
        <AdmField label="发什么">
          <RewardItemsEditor :key="formKey" v-model="rewards" id-prefix="grant" @over="over = $event" />
        </AdmField>
        <AdmField label="方式">
          <label class="dt-adm-check"
            ><input v-model="asMail" type="checkbox" data-testid="grant-as-mail" />
            改为发邮件（玩家在邮箱里领取; 全区服只发给现在已开的店）</label
          >
        </AdmField>
        <AdmField label="原因" hint="玩家日志里能看到">
          <input v-model="reason" class="dt-adm-in dt-adm-full" data-testid="grant-reason" />
        </AdmField>
        <AdmField>
          <button
            type="submit"
            class="dt-adm-btn is-p"
            :disabled="busy || !reason.trim() || over.length > 0"
            data-testid="grant-submit"
          >
            发放…
          </button>
        </AdmField>
      </form>
    </AdmBox>

    <AdmBox title="发放记录" :sub="`${list.length} 次`" flush>
      <div class="dt-adm-scroll">
        <table v-if="list.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>#</th>
              <th>对象</th>
              <th>内容</th>
              <th>原因</th>
              <th>状态</th>
              <th class="num">进度</th>
              <th>操作人</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in list" :key="g.id">
              <td class="dt-adm-mono dt-adm-mu">{{ g.id }}</td>
              <td class="nowrap">
                {{
                  g.target === 'rest'
                    ? `餐厅 ${g.restId}`
                    : `全区服${g.minLevel ? ` (≥ ${g.minLevel} 级)` : ''}`
                }}
              </td>
              <td>{{ summary(g.items) }}</td>
              <td>{{ g.reason }}</td>
              <td>
                <span :class="['dt-adm-tag', STATUS_TONE[g.status]]">{{ STATUS[g.status] }}</span>
              </td>
              <td class="num nowrap">
                {{ g.doneCount }}/{{ g.total
                }}<span v-if="g.failedCount" class="dt-adm-bad"> (失败 {{ g.failedCount }})</span>
              </td>
              <td class="dt-adm-mu">{{ g.actor ?? '—' }}</td>
              <td class="dt-adm-mu nowrap">{{ adminShort(g.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else title="还没有发过补偿" />
      </div>
    </AdmBox>
  </div>
</template>
