<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AccessBanDto, AccessBanKind } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import { adminShort } from '../../utils/gameInput';
import AdmBox from './kit/AdmBox.vue';
import AdmEmpty from './kit/AdmEmpty.vue';

/**
 * 后台"可疑数据 → 封禁名单"（2026-10-16 小号刷一番赏）：封 IP、IP 段或设备号，命中的请求一律拒绝；
 * 可以一并永久封掉最近 30 天用它登录过的玩家。协管只能看，管理员能加、能解
 */
const props = defineProps<{ prefill?: { kind: AccessBanKind; value: string } | null }>();
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const isAdmin = computed(() => admin.me?.role === 'admin');
const rows = ref<AccessBanDto[]>([]);
const busy = ref(false);
const kind = ref<AccessBanKind>('ip');
const value = ref('');
const reason = ref('');
const banAccounts = ref(true);

watch(
  () => props.prefill,
  (p) => {
    if (!p) return;
    kind.value = p.kind;
    value.value = p.value;
  },
  { immediate: true },
);

async function load() {
  try {
    rows.value = await adminApi.accessBans();
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
onMounted(() => void load());

async function add() {
  const v = value.value.trim();
  const why = reason.value.trim();
  if (!v || !why) return toast.push('要填 IP（段）或设备号，还有原因', 'danger');
  const ok = await confirm.ask({
    title: `封禁${kind.value === 'ip' ? ' IP' : '设备'} ${v}`,
    body: banAccounts.value
      ? '这个 IP（段）或设备来的请求一律拒绝，最近 30 天用它登录过的玩家一并永久封号、踢下线。'
      : '这个 IP（段）或设备来的请求一律拒绝（注册、登录、已登录的都挡）。',
    ok: '封禁',
    danger: true,
  });
  if (!ok) return;
  busy.value = true;
  try {
    const r = await adminApi.addAccessBan({
      kind: kind.value,
      value: v,
      reason: why,
      banAccounts: banAccounts.value,
    });
    toast.push(banAccounts.value ? `已封禁, 一并封号 ${r.bannedAccounts.length} 个` : '已封禁');
    value.value = '';
    reason.value = '';
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '封禁失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

async function remove(r: AccessBanDto) {
  const ok = await confirm.ask({
    title: `解除封禁 ${r.value}`,
    body: '只解除这条 IP（段）或设备的封禁；一并封掉的账号要到玩家页逐个解封。',
    ok: '解除',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await adminApi.removeAccessBan(r.id);
    toast.push('已解除');
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '解除失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AdmBox
    v-if="isAdmin"
    title="封禁 IP 或设备"
    sub="IP 可以写一个地址或一段（如 38.28.0.0/16）；设备号在“多号”里能看到。不能封你自己当前的 IP"
  >
    <div class="dt-adm-fbar">
      <select v-model="kind" class="dt-adm-in" aria-label="类型" data-testid="ban-kind">
        <option value="ip">IP / IP 段</option>
        <option value="device">设备号</option>
      </select>
      <input
        v-model="value"
        class="dt-adm-in dt-adm-mono"
        :placeholder="kind === 'ip' ? '38.28.221.33 或 38.28.0.0/16' : '设备号'"
        aria-label="IP 或设备号"
        data-testid="ban-value"
      />
      <input
        v-model="reason"
        class="dt-adm-in"
        placeholder="原因"
        aria-label="原因"
        data-testid="ban-reason"
      />
      <label class="dt-adm-small"
        ><input v-model="banAccounts" type="checkbox" data-testid="ban-accounts" />
        一并封掉用它登录过的账号</label
      >
      <button type="button" class="dt-adm-btn is-d" :disabled="busy" data-testid="ban-add" @click="add">
        封禁
      </button>
    </div>
  </AdmBox>
  <AdmBox title="封禁名单" :sub="`${rows.length} 条`" flush>
    <AdmEmpty v-if="rows.length === 0" title="没有封禁的 IP 或设备" />
    <table v-else class="dt-adm-table">
      <tbody>
        <tr v-for="r in rows" :key="r.id" :data-testid="`ban-row-${r.id}`">
          <td>
            <span class="dt-adm-tag is-w me-1">{{ r.kind === 'ip' ? 'IP' : '设备' }}</span>
            <b class="dt-adm-mono">{{ r.value }}</b
            >: {{ r.reason }}
            <div class="dt-adm-mu dt-adm-small">
              {{ r.actor ?? '?' }} · {{ adminShort(r.createdAt) }} · 最近 30 天用它登录过
              {{ r.accounts }} 个账号
            </div>
          </td>
          <td class="acts">
            <button
              v-if="isAdmin"
              type="button"
              class="dt-adm-btn is-s is-sm"
              :disabled="busy"
              :data-testid="`ban-remove-${r.id}`"
              @click="remove(r)"
            >
              解除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </AdmBox>
</template>
