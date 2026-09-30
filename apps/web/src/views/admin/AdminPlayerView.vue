<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type {
  AccountRole,
  AdminLedgerRowDto,
  AdminRestaurantDto,
  PlayerDetailDto,
  RoundSummaryDto,
  RestLogDto,
} from '@dt/shared';
import { adminApi } from '../../api/admin';
import RestIcons from '../../components/admin/RestIcons.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { logText } from '../../utils/events';

const route = useRoute();
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const id = computed(() => Number(route.params.id));
const player = ref<PlayerDetailDto | null>(null);
const restId = ref<number | null>(null);
const rest = ref<AdminRestaurantDto | null>(null);
const tab = ref<'ledger' | 'log' | 'income'>('ledger');
const kind = ref('');
const source = ref('');
const ledgerRows = ref<AdminLedgerRowDto[]>([]);
const logRows = ref<RestLogDto[]>([]);
const incomeRows = ref<RoundSummaryDto[]>([]);
const next = ref<string | null>(null);
const banReason = ref('');
const renameName = ref('');
const renameReason = ref('');
const busy = ref(false);
const ROLE: Record<AccountRole, string> = { player: '玩家', mod: '协管', admin: '管理员' };

async function run(fn: () => Promise<unknown>, fail: string, done?: string) {
  busy.value = true;
  try {
    await fn();
    if (done) toast.push(done);
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}

async function loadTab(reset: boolean) {
  if (restId.value === null) return;
  const before = reset ? undefined : (next.value ?? undefined);
  if (tab.value === 'ledger') {
    const p = await adminApi.ledger(restId.value, {
      kind: kind.value || undefined,
      source: source.value || undefined,
      before,
    });
    ledgerRows.value = reset ? p.items : [...ledgerRows.value, ...p.items];
    next.value = p.nextBefore;
  } else if (tab.value === 'log') {
    const p = await adminApi.restLog(restId.value, before);
    logRows.value = reset ? p.items : [...logRows.value, ...p.items];
    next.value = p.nextBefore;
  } else {
    const p = await adminApi.income(restId.value, before);
    incomeRows.value = reset ? p.items : [...incomeRows.value, ...p.items];
    next.value = p.nextBefore;
  }
}

async function loadRest() {
  if (restId.value === null) return;
  rest.value = await adminApi.restaurant(restId.value);
  await loadTab(true);
}

async function load() {
  await run(async () => {
    player.value = await adminApi.player(id.value);
    restId.value ??= player.value.restaurants[0]?.id ?? null;
    await loadRest();
  }, '读取玩家失败');
}
watch(id, load, { immediate: true });
watch(tab, () => void loadTab(true));

const ban = () =>
  run(
    async () => {
      await adminApi.ban(id.value, banReason.value.trim());
      banReason.value = '';
      await load();
    },
    '封号失败',
    '已封号',
  );
const unban = () =>
  run(
    async () => {
      await adminApi.unban(id.value);
      await load();
    },
    '解封失败',
    '已解封',
  );
const changeRole = (role: AccountRole) =>
  run(
    async () => {
      await adminApi.setRole(id.value, role);
      await load();
    },
    '修改角色失败',
    '已修改角色',
  );
const rename = () =>
  run(
    async () => {
      await adminApi.rename(restId.value!, renameName.value.trim(), renameReason.value.trim());
      renameName.value = '';
      renameReason.value = '';
      await load();
    },
    '改名失败',
    '已改名',
  );
</script>

<template>
  <div v-if="player">
    <h5>
      {{ player.username }}
      <small class="text-muted">#{{ player.accountId }} · {{ ROLE[player.role] }}</small>
    </h5>
    <div class="small mb-2">
      {{ player.email }}（{{ player.emailVerified ? '已验证' : '未验证' }}） · 注册于
      {{ new Date(player.createdAt).toLocaleString('zh-CN') }}
      <span v-if="player.banned" class="text-danger"> · 已封禁：{{ player.banReason }}</span>
    </div>

    <div class="d-flex flex-wrap gap-2 mb-3">
      <template v-if="!player.banned">
        <input
          v-model="banReason"
          class="form-control form-control-sm w-auto"
          placeholder="封号原因"
          data-testid="ban-reason"
        />
        <button
          class="btn btn-outline-danger btn-sm"
          data-testid="ban"
          :disabled="busy || !banReason.trim()"
          @click="ban"
        >
          封号
        </button>
      </template>
      <button
        v-else
        class="btn btn-outline-success btn-sm"
        data-testid="unban"
        :disabled="busy"
        @click="unban"
      >
        解封
      </button>
      <select
        v-if="admin.isAdmin && admin.me?.accountId !== player.accountId"
        class="form-select form-select-sm w-auto"
        data-testid="role-select"
        :value="player.role"
        @change="changeRole(($event.target as HTMLSelectElement).value as AccountRole)"
      >
        <option v-for="(label, r) in ROLE" :key="r" :value="r">{{ label }}</option>
      </select>
    </div>

    <div class="d-flex flex-wrap gap-1 mb-2">
      <button
        v-for="s in player.restaurants"
        :key="s.id"
        class="btn btn-sm"
        :class="s.id === restId ? 'btn-primary' : 'btn-outline-primary'"
        @click="
          restId = s.id;
          void loadRest();
        "
      >
        {{ s.shardName }} · {{ s.name }}
      </button>
    </div>

    <div v-if="rest" class="small">
      <div class="mb-2">
        {{ rest.overview.name }} · {{ rest.overview.level }} 级 {{ rest.overview.starLevel }} 星 · 银币
        {{ rest.overview.coin }} · 钻石 {{ rest.overview.diamond }} · 油 {{ rest.overview.oil }}/{{
          rest.overview.oilMax
        }}
      </div>
      <div class="d-flex flex-wrap gap-2 mb-2">
        <input v-model="renameName" class="form-control form-control-sm w-auto" placeholder="新店名" />
        <input v-model="renameReason" class="form-control form-control-sm w-auto" placeholder="改名原因" />
        <button
          class="btn btn-outline-secondary btn-sm"
          :disabled="busy || !renameName.trim() || !renameReason.trim()"
          @click="rename"
        >
          强制改名
        </button>
        <RouterLink
          :to="`/admin/grants?restId=${restId}`"
          class="btn btn-outline-primary btn-sm"
          data-testid="grant-link"
          >给这家店发补偿</RouterLink
        >
      </div>
      <RestIcons v-if="restId !== null" :restId="restId" />
      <div class="row">
        <div class="col-md-6">
          <h6>仓库</h6>
          <div v-for="g in rest.store" :key="g.goodsId">{{ catalog.goodsName(g.goodsId) }} ×{{ g.num }}</div>
          <div v-for="e in rest.equips" :key="`e${e.id}`">
            {{ catalog.goodsName(e.goodsId) }}{{ e.stress > 0 ? ` +${e.stress}` : '' }}（厨具{{
              e.worn ? '，穿戴中' : ''
            }}{{ e.locked ? '，锁定' : '' }}{{ e.gems > 0 ? `，宝石 ${e.gems}` : '' }}）
          </div>
        </div>
        <div class="col-md-6">
          <h6>橱柜 / 冰箱</h6>
          <div v-for="f in rest.cupboard" :key="f.foodsId">
            {{ catalog.foodName(f.foodsId) }} ×{{ f.num
            }}<span v-if="f.fridgeNum"> · 冰箱 {{ f.fridgeNum }}</span>
          </div>
        </div>
      </div>

      <ul class="nav nav-tabs mt-3">
        <li
          v-for="t in [
            ['ledger', '流水'],
            ['log', '个人日志'],
            ['income', '收益'],
          ] as const"
          :key="t[0]"
          class="nav-item"
        >
          <a href="#" class="nav-link" :class="{ active: tab === t[0] }" @click.prevent="tab = t[0]">{{
            t[1]
          }}</a>
        </li>
      </ul>
      <div v-if="tab === 'ledger'" class="d-flex gap-2 my-2">
        <input
          v-model="kind"
          class="form-control form-control-sm w-auto"
          placeholder="类型（coin / goods …）"
        />
        <input
          v-model="source"
          class="form-control form-control-sm w-auto"
          placeholder="来源（market.buy …）"
        />
        <button class="btn btn-sm btn-outline-secondary" @click="loadTab(true)">筛选</button>
      </div>
      <table v-if="tab === 'ledger'" class="table table-sm">
        <tbody>
          <tr v-for="(l, i) in ledgerRows" :key="i">
            <td>{{ new Date(l.at).toLocaleString('zh-CN') }}</td>
            <td>{{ l.kind }}{{ l.itemId ? ` #${l.itemId}` : '' }}</td>
            <td :class="l.delta < 0 ? 'text-danger' : 'text-success'">{{ l.delta }}</td>
            <td>{{ l.source }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="tab === 'log'">
        <div v-for="(l, i) in logRows" :key="i">
          <span class="text-muted">{{ new Date(l.at).toLocaleString('zh-CN') }}</span>
          {{ logText(l, catalog) }}
        </div>
      </div>
      <table v-if="tab === 'income'" class="table table-sm">
        <tbody>
          <tr v-for="r in incomeRows" :key="r.roundNo">
            <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
            <td>银币 {{ r.coin }}</td>
            <td>经验 {{ r.exp }}</td>
            <td>油 {{ r.oil }}</td>
          </tr>
        </tbody>
      </table>
      <button v-if="next" class="btn btn-link btn-sm" @click="loadTab(false)">加载更多</button>
    </div>
  </div>
</template>
