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
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import AdmKpi from '../../components/admin/kit/AdmKpi.vue';
import AdmTabs from '../../components/admin/kit/AdmTabs.vue';
import DtSheet from '../../components/DtSheet.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useSessionStore } from '../../stores/session';
import { useToastStore } from '../../stores/toast';
import { logText } from '../../utils/events';
import { equipName } from '../../utils/equipName';
import { formatNum } from '../../utils/format';
import { adminMinute, adminShort } from '../../utils/gameInput';

/**
 * 玩家详情（界面改版 P12）：页头写用户名、账号 id、角色，邮箱和注册时间；“封号…”点了弹面板填原因和天数。
 * 每个区服的店一个标签；店的数字排成一排小数字块，下面改名、发补偿。流水表的东西写名字 + 编号，数量正绿负红
 */

const route = useRoute();
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const session = useSessionStore();
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
/** 封号天数（子项目 6B-1）：协管只能 1 天或 7 天，管理员还能选永久（0） */
const banDays = ref(1);
const renameName = ref('');
const renameReason = ref('');
const busy = ref(false);
const banOpen = ref(false);
const renameOpen = ref(false);
const TABS = [
  ['ledger', '流水'],
  ['log', '个人日志'],
  ['income', '收益'],
] as const;
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
    // 换了玩家：原来选中的店不是他的就换成他的第一家
    const keep = player.value.restaurants.some((r) => r.id === restId.value)
      ? restId.value
      : (player.value.restaurants[0]?.id ?? null);
    if (keep === restId.value) await loadRest();
    else restId.value = keep;
  }, '读取玩家失败');
}
watch(id, load, { immediate: true });
watch(tab, () => void loadTab(true));
// 点了别的区服的店（标签）
watch(restId, () => void loadRest());

const restTabs = computed(() =>
  (player.value?.restaurants ?? []).map((s) => [s.id, `${s.shardName} · ${s.name} (店 ${s.id})`] as const),
);
/** 看它的店：好友餐厅只能看同一区服的，自己正在玩的区服和这家店一样时才给链接 */
const canVisit = computed(() => !!rest.value && session.me?.shardId === rest.value.overview.shardId);
/** 仓库（道具 + 厨具）和橱柜并排成一张表 */
const stock = computed(() => {
  const r = rest.value;
  if (!r) return [];
  const store = [
    ...r.store.map((g) => ({ name: catalog.goodsName(g.goodsId), num: g.num, note: '' })),
    ...r.equips.map((e) => ({
      name: `${equipName(catalog, e)}${e.stress > 0 ? ` +${e.stress}` : ''}`,
      num: 1,
      note: `(厨具${e.worn ? ', 穿戴中' : ''}${e.locked ? ', 锁定' : ''}${e.gems > 0 ? `, 宝石 ${e.gems}` : ''})`,
    })),
  ];
  const foods = r.cupboard.map((f) => ({
    name: catalog.foodName(f.foodsId),
    num: f.num,
    fridge: f.fridgeNum,
  }));
  return Array.from({ length: Math.max(store.length, foods.length) }, (_, i) => ({
    store: store[i],
    food: foods[i],
  }));
});
const KIND_NAME: Record<string, string> = { coin: '银币', diamond: '钻石', exp: '经验', oil: '油' };
/** 流水里的东西：道具、食材写名字（后面跟编号），银币这些写中文名 */
function itemName(l: AdminLedgerRowDto): string {
  if (l.itemId && l.kind === 'goods') return catalog.goodsName(l.itemId);
  if (l.itemId && l.kind === 'foods') return catalog.foodName(l.itemId);
  return KIND_NAME[l.kind] ?? '';
}
const signed = (n: number) => (n < 0 ? `−${formatNum(-n)}` : `+${formatNum(n)}`);
const tabEmpty = computed(
  () =>
    (tab.value === 'ledger' && ledgerRows.value.length === 0) ||
    (tab.value === 'log' && logRows.value.length === 0) ||
    (tab.value === 'income' && incomeRows.value.length === 0),
);

const ban = () =>
  run(
    async () => {
      await adminApi.ban(id.value, banReason.value.trim(), banDays.value);
      banReason.value = '';
      banOpen.value = false;
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
      renameOpen.value = false;
      await load();
    },
    '改名失败',
    '已改名',
  );
</script>

<template>
  <div v-if="player" class="dt-adm-page">
    <AdmHead>
      <template #crumb><RouterLink to="/admin/players">玩家</RouterLink> › {{ player.username }}</template>
      <template #title
        >{{ player.username }} <span class="dt-adm-ph-id">#{{ player.accountId }}</span
        ><span :class="['dt-adm-tag', player.role === 'player' ? '' : 'is-p']">{{
          ROLE[player.role]
        }}</span></template
      >
      <template #desc
        >{{ player.email }}
        <span :class="['dt-adm-tag', player.emailVerified ? 'is-ok' : 'is-w']">{{
          player.emailVerified ? '已验证' : '没验证'
        }}</span>
        · 注册于 {{ adminMinute(player.createdAt) }}</template
      >
      <select
        v-if="admin.isAdmin && admin.me?.accountId !== player.accountId"
        class="dt-adm-in"
        aria-label="角色"
        data-testid="role-select"
        :value="player.role"
        @change="changeRole(($event.target as HTMLSelectElement).value as AccountRole)"
      >
        <option v-for="(label, r) in ROLE" :key="r" :value="r">角色: {{ label }}</option>
      </select>
      <button
        v-if="!player.banned"
        type="button"
        class="dt-adm-btn is-d"
        data-testid="ban-open"
        @click="banOpen = true"
      >
        封号…
      </button>
      <button
        v-else-if="admin.isAdmin"
        type="button"
        class="dt-adm-btn is-s"
        data-testid="unban"
        :disabled="busy"
        @click="unban"
      >
        解封
      </button>
    </AdmHead>

    <div v-if="player.banned" class="dt-adm-alert is-d" data-testid="ban-state">
      <i class="bi bi-slash-circle" aria-hidden="true"></i>
      <div>
        <b>已封禁: {{ player.banReason }}</b>
        {{ player.bannedUntil ? `封号至 ${adminMinute(player.bannedUntil)}` : '永久封号' }}
      </div>
    </div>

    <AdmBox flush>
      <AdmTabs
        v-if="player.restaurants.length > 0"
        v-model="restId"
        :options="restTabs"
        testid="player-rest"
      />
      <div class="dt-adm-bb">
        <AdmEmpty v-if="player.restaurants.length === 0" title="还没开店" text="这个账号在哪个区服都没有店" />
        <template v-else-if="rest">
          <div class="dt-adm-g6">
            <AdmKpi small label="等级" :value="rest.overview.level" />
            <AdmKpi small label="星级" :value="`${rest.overview.starLevel} 星`" />
            <AdmKpi small label="银币" :value="formatNum(rest.overview.coin)" />
            <AdmKpi small label="钻石" :value="formatNum(rest.overview.diamond)" />
            <AdmKpi
              small
              label="油"
              :value="`${formatNum(rest.overview.oil)} / ${formatNum(rest.overview.oilMax)}`"
            />
            <AdmKpi small label="街道" :value="rest.overview.streetName || '—'" />
          </div>
          <div class="dt-adm-line dt-adm-mt">
            <button
              type="button"
              class="dt-adm-btn is-s"
              data-testid="rename-open"
              @click="renameOpen = true"
            >
              强制改名…
            </button>
            <RouterLink
              :to="`/admin/grants?restId=${restId}`"
              class="dt-adm-btn is-sp"
              data-testid="grant-link"
              >给这家店发补偿</RouterLink
            >
            <RouterLink v-if="canVisit" :to="`/friends/${restId}`" class="dt-adm-btn is-t"
              >看它的店 ›</RouterLink
            >
          </div>
        </template>
      </div>
    </AdmBox>

    <div v-if="rest" class="dt-adm-g2">
      <RestIcons v-if="restId !== null" :restId="restId" />
      <AdmBox
        title="仓库和橱柜"
        :sub="`仓库 ${rest.store.length + rest.equips.length} 种 · 橱柜 ${rest.cupboard.length} 种`"
        flush
      >
        <table v-if="stock.length > 0" class="dt-adm-table">
          <tbody>
            <tr v-for="(row, i) in stock" :key="i">
              <td>
                {{ row.store?.name
                }}<span v-if="row.store?.note" class="dt-adm-mu"> {{ row.store.note }}</span>
              </td>
              <td class="num">{{ row.store?.num }}</td>
              <td>{{ row.food?.name }}</td>
              <td class="num">
                {{ row.food?.num
                }}<span v-if="row.food?.fridge" class="dt-adm-mu"> · 冰箱 {{ row.food.fridge }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <AdmEmpty v-else title="仓库和橱柜都是空的" />
      </AdmBox>
    </div>

    <AdmBox v-if="rest" flush>
      <AdmTabs v-model="tab" :options="TABS" testid="player-tab" />
      <form v-if="tab === 'ledger'" class="dt-adm-fbar" @submit.prevent="loadTab(true)">
        <input v-model="kind" class="dt-adm-in dt-adm-w-md" placeholder="类型 (coin / goods …)" />
        <input v-model="source" class="dt-adm-in dt-adm-w-md" placeholder="来源 (market.buy …)" />
        <button class="dt-adm-btn is-sp">筛选</button>
      </form>
      <div class="dt-adm-scroll">
        <table v-if="tab === 'ledger' && ledgerRows.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>类型</th>
              <th>东西</th>
              <th class="num">数量</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in ledgerRows" :key="i">
              <td class="dt-adm-mu nowrap">{{ adminShort(l.at) }}</td>
              <td>
                <span class="dt-adm-tag">{{ l.kind }}</span>
              </td>
              <td>
                {{ itemName(l) }}<span v-if="l.itemId" class="dt-adm-mono dt-adm-mu"> #{{ l.itemId }}</span>
              </td>
              <td :class="['num', l.delta < 0 ? 'dt-adm-dn' : 'dt-adm-up']">{{ signed(l.delta) }}</td>
              <td class="dt-adm-mono">{{ l.source }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="tab === 'log' && logRows.length > 0" class="dt-adm-table">
          <tbody>
            <tr v-for="(l, i) in logRows" :key="i">
              <td class="dt-adm-mu nowrap dt-adm-w-time">{{ adminShort(l.at) }}</td>
              <td>{{ logText(l, catalog) }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="tab === 'income' && incomeRows.length > 0" class="dt-adm-table">
          <thead>
            <tr>
              <th>结算时间</th>
              <th class="num">银币</th>
              <th class="num">经验</th>
              <th class="num">油</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in incomeRows" :key="r.roundNo">
              <td class="dt-adm-mu nowrap">{{ adminShort(r.at) }}</td>
              <td class="num">{{ formatNum(r.coin) }}</td>
              <td class="num">{{ formatNum(r.exp) }}</td>
              <td class="num">{{ formatNum(r.oil) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AdmEmpty v-if="tabEmpty" title="没有记录" />
      <div v-if="next" class="dt-adm-more">
        <button type="button" class="dt-adm-btn is-s" @click="loadTab(false)">加载更多</button>
      </div>
    </AdmBox>

    <DtSheet :open="banOpen" :title="`封号: ${player.username}`" @close="banOpen = false">
      <p class="dt-sheet-text">封号后这个账号登不上游戏, 到期自动解封。原因会写进审计日志。</p>
      <div class="dt-adm-line">
        <input
          v-model="banReason"
          class="dt-adm-in dt-adm-grow"
          placeholder="封号原因 (必填)"
          data-testid="ban-reason"
        />
        <select v-model.number="banDays" class="dt-adm-in" data-testid="ban-days">
          <option :value="1">1 天</option>
          <option :value="7">7 天</option>
          <option v-if="admin.isAdmin" :value="0">永久</option>
        </select>
      </div>
      <template #actions>
        <button type="button" class="btn btn-outline-secondary" @click="banOpen = false">取消</button>
        <button
          type="button"
          class="btn btn-outline-danger"
          data-testid="ban"
          :disabled="busy || !banReason.trim()"
          @click="ban"
        >
          封号
        </button>
      </template>
    </DtSheet>
    <DtSheet :open="renameOpen" title="强制改名" @close="renameOpen = false">
      <p class="dt-sheet-text">店名改掉后玩家会在日志里看到原因。</p>
      <div class="dt-adm-line">
        <input
          v-model="renameName"
          class="dt-adm-in dt-adm-grow"
          placeholder="新店名"
          data-testid="rename-name"
        />
        <input
          v-model="renameReason"
          class="dt-adm-in dt-adm-grow"
          placeholder="改名原因"
          data-testid="rename-reason"
        />
      </div>
      <template #actions>
        <button type="button" class="btn btn-outline-secondary" @click="renameOpen = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="rename"
          :disabled="busy || !renameName.trim() || !renameReason.trim()"
          @click="rename"
        >
          改名
        </button>
      </template>
    </DtSheet>
  </div>
</template>
