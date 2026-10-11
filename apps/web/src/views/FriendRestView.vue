<script setup lang="ts">
import IconTag from '../components/IconTag.vue';
import AcquireCard from '../components/acquire/AcquireCard.vue';
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { FriendRestDto, TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { formatNum } from '../utils/format';
import { useT } from '../composables/useT';
import DtArt from '../components/DtArt.vue';
import DtLevelRing from '../components/DtLevelRing.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import DtSkeleton from '../components/DtSkeleton.vue';
import HomeScene from '../components/home/HomeScene.vue';
import ReportButton from '../components/ReportButton.vue';
import TableGrid from '../components/TableGrid.vue';
import FriendDuel from '../components/tower/FriendDuel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { usePageMenu } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { GRADE_NAMES, PART_NAMES } from '../utils/labels';
import { equipName } from '../utils/equipName';
import { restName, restNotice } from '../utils/npcName';

/**
 * 好友餐厅（界面改版 P10）：店头和自己首页一样（门面、等级环、店名），称号一排；
 * 好友时 2×3 操作块（点赞、加油、翻橱柜、换食材、好友对决、菜园）；特色菜一行；餐桌格子（点一张从下面弹出）；
 * 公告、厨具、收购收成“店里”几行，点开面板。举报店名、删除好友在顶栏右边“⋯”
 */
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const confirm = useConfirmStore();
const t = useT();
const catalog = useCatalogStore();
const session = useSessionStore();
const restStore = useRestaurantStore();
const restId = computed(() => Number(route.params.restId));
const rest = ref<FriendRestDto | null>(null);
/** 所在街道（问题记录 571）；目录里没有时为空，不写 */
const streetLabel = computed(() => (rest.value ? catalog.streetName(rest.value.streetId) : ''));
const picked = ref<TableDto | null>(null);
const busy = ref(false);
const error = ref('');
type Sheet = 'notice' | 'equips' | 'acquire' | 'menu' | null;
const sheet = ref<Sheet>(null);

async function load() {
  try {
    rest.value = await endpoints.friendDetail(restId.value);
    if (picked.value) picked.value = rest.value.tables.find((t) => t.no === picked.value!.no) ?? null;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, t.value.friends.rest.loadFailed);
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    picked.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const isEmpty = (t: TableDto) => (t.customer === 0 || t.customer === -3) && !t.roach && !t.freeloaderRestId;
const mine = computed(() => session.me?.restaurantId ?? null);
const equips = computed(() => [...(rest.value?.equips ?? [])].sort((a, b) => a.part - b.part));
const maxStress = computed(() => Math.max(0, ...equips.value.map((e) => e.stress)));
const canReport = computed(() => !!rest.value && rest.value.id !== mine.value && !rest.value.npc);
const canRemove = computed(() => !!rest.value && rest.value.isFriend && !rest.value.npc);
/** 顶栏“⋯”：能举报或删好友时才有 */
usePageMenu(() =>
  canReport.value || canRemove.value
    ? { label: t.value.friends.rest.more, open: () => (sheet.value = 'menu') }
    : null,
);

function refuel(num: number) {
  return act(
    () => endpoints.friendRefuel(restId.value, num),
    t.value.friends.rest.refueled,
    t.value.friends.rest.refuelFailed,
  );
}
async function remove() {
  if (!rest.value) return;
  sheet.value = null;
  const yes = await confirm.ask({
    title: t.value.friends.rest.removeConfirm(rest.value.name),
    ok: t.value.friends.rest.remove,
    danger: true,
  });
  if (!yes) return;
  return act(
    async () => {
      await endpoints.friendRemove(restId.value);
      await router.push('/friends');
    },
    t.value.friends.rest.removed,
    t.value.friends.rest.removeFailed,
  );
}
/** 点桌子：好友的店才弹出面板 */
function pick(x: TableDto) {
  if (rest.value?.isFriend) picked.value = x;
}
/** 面板标题里桌子的状态 */
const tableState = computed(() => {
  const p = picked.value;
  const r = t.value.friends.rest;
  if (!p) return '';
  if (isEmpty(p)) return r.stateEmpty;
  if (p.customer === 3) return r.stateRoach;
  return r.stateBusy;
});

const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <template v-if="rest">
    <!-- 店头（界面改版 P10）：和自己首页同一个场景，门画成它的门（P4），停业时招牌下挂牌 -->
    <section class="dt-home-top" data-testid="friend-hero">
      <HomeScene :door="rest.door" :closed="rest.state !== 1">
        <template #meta>
          <span class="dt-scene-street" data-testid="friend-street"
            ><template v-if="streetLabel">{{ streetLabel }} · </template>{{ t.home.stars(rest.star) }}</span
          >
        </template>
      </HomeScene>
      <div class="dt-home-level">
        <DtLevelRing :level="rest.level" :percent="0"
          ><span data-testid="friend-level">{{ rest.level }}</span></DtLevelRing
        >
        <div class="dt-home-level-main">
          <h2 class="dt-friend-name" data-testid="friend-name">{{ restName(rest.id, rest.name) }}</h2>
          <!-- 声望、累计获赞（问题记录 553）；旧服务端没有获赞时不写（前端可能先上线） -->
          <span class="dt-friend-meta" data-testid="friend-info"
            >{{ t.friends.rest.renown(formatNum(rest.renown))
            }}<template v-if="typeof rest.thumbs === 'number'">
              ·
              <span data-testid="friend-thumbs">{{
                t.friends.rest.thumbsTotal(formatNum(rest.thumbs))
              }}</span></template
            ></span
          >
        </div>
      </div>
    </section>
    <!-- 称号一排（问题记录 571） -->
    <div v-if="rest.icons.length > 0" class="dt-friend-icons" data-testid="friend-icons">
      <IconTag v-for="i in rest.icons" :key="i.key" :title="catalog.icon(i.key)?.title ?? i.title" />
    </div>
    <HiphopCard :rest-id="restId" class="mt-2" />

    <!-- 操作块：好友才有；不是好友时一个整宽“加好友” -->
    <div v-if="rest.isFriend" class="dt-do-grid mt-3" data-testid="act-bar">
      <span v-if="rest.thumbedToday" class="dt-do is-done" data-testid="act-thumb">
        <span class="dt-do-title">{{ t.friends.rest.thumbedAlready }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.thumbTomorrow }}</span>
      </span>
      <button
        v-else
        type="button"
        class="dt-do"
        :disabled="busy"
        data-testid="act-thumb"
        @click="act(() => endpoints.thumbUp(restId), t.friends.rest.thumbed, t.friends.rest.thumbFailed)"
      >
        <span class="dt-do-title">{{ t.friends.rest.thumb }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.thumbSub }}</span>
      </button>
      <button type="button" class="dt-do" :disabled="busy" data-testid="act-refuel" @click="refuel(-1)">
        <span class="dt-do-title">{{ t.friends.rest.refuel }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.refuelSub }}</span>
      </button>
      <RouterLink class="dt-do is-primary" :to="`/friends/${restId}/flip`" data-testid="act-flip">
        <span class="dt-do-title">{{ t.friends.rest.flip }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.flipSub }}</span>
      </RouterLink>
      <RouterLink class="dt-do" :to="`/friends/${restId}/exchange`" data-testid="act-exchange">
        <span class="dt-do-title">{{ t.friends.rest.exchange }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.exchangeSub }}</span>
      </RouterLink>
      <FriendDuel v-if="!rest.npc" :key="restId" :rest-id="restId" />
      <RouterLink v-if="!rest.npc" class="dt-do" :to="`/yard?friend=${restId}`" data-testid="to-yard">
        <span class="dt-do-title">{{ t.friends.rest.yard }}</span>
        <span class="dt-do-sub">{{ t.friends.rest.yardSub }}</span>
      </RouterLink>
    </div>
    <template v-else-if="rest.id !== mine">
      <span v-if="rest.requested" class="dt-card dt-up-max mt-3 d-block" data-testid="add-friend">{{
        t.friends.requested
      }}</span>
      <button
        v-else
        type="button"
        class="btn btn-primary dt-btn-block mt-3"
        data-testid="add-friend"
        :disabled="busy"
        @click="act(() => endpoints.friendApply(restId), t.friends.applied, t.friends.applyFailed)"
      >
        {{ t.friends.addFriend }}
      </button>
    </template>

    <!-- 在售特色菜一行（子项目 4A）：别人的店可以品尝 -->
    <div v-if="rest.special" class="dt-card dt-rows-card mt-3" data-testid="friend-special">
      <DtRow strong>
        <template #icon><DtArt name="town-dish" :size="28" /></template>
        <template #title
          >{{ catalog.mcName(rest.special.mcId) }}
          <span class="dt-tag dt-tag-warn">{{ GRADE_NAMES[rest.special.grade] ?? '' }}</span></template
        >
        <template #sub>{{ t.friends.rest.specialSub(rest.special.leftNum, rest.special.price) }}</template>
        <template v-if="rest.id !== mine" #end>
          <span v-if="rest.special.eaten" class="dt-tag dt-tag-ok" data-testid="act-taste">{{
            t.friends.rest.tastedAlready
          }}</span>
          <button
            v-else
            type="button"
            class="btn btn-sm btn-outline-primary"
            data-testid="act-taste"
            :disabled="busy || rest.state !== 1"
            @click="act(() => endpoints.mcTaste(restId), t.friends.rest.tasted, t.friends.rest.tasteFailed)"
          >
            {{ t.friends.rest.taste }}
          </button>
        </template>
      </DtRow>
    </div>

    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.friends.rest.tablesTitle }}</h2>
    </div>
    <TableGrid :tables="rest.tables" :selected="picked?.no ?? null" @pick="pick" />
    <p v-if="rest.isFriend" class="dt-block-note mt-1">{{ t.friends.rest.tablesNote }}</p>

    <!-- 店里：公告、厨具、收购，点开面板 -->
    <template v-if="rest.notice || equips.length > 0 || (restStore.featureOn('acquire') && canReport)">
      <div class="dt-block-head mt-3">
        <h2 class="dt-block-title">{{ t.friends.rest.shopTitle }}</h2>
      </div>
      <div class="dt-card dt-rows-card">
        <button
          v-if="rest.notice"
          type="button"
          class="dt-row is-link"
          data-testid="friend-notice"
          @click="sheet = 'notice'"
        >
          <span class="dt-row-main">
            <span class="dt-row-title is-strong">{{ t.friends.rest.noticeTitle }}</span>
            <span class="dt-row-sub">{{ restNotice(rest.id, rest.notice) }}</span>
          </span>
        </button>
        <button
          v-if="equips.length > 0"
          type="button"
          class="dt-row is-link"
          data-testid="friend-equips"
          @click="sheet = 'equips'"
        >
          <span class="dt-row-main">
            <span class="dt-row-title is-strong">{{ t.friends.rest.equips }}</span>
            <span class="dt-row-sub">{{ t.friends.rest.equipsSub(equips.length, maxStress) }}</span>
          </span>
        </button>
        <!-- 收购（问题记录 421）：蟹老板、自己的店不显示 -->
        <button
          v-if="restStore.featureOn('acquire') && canReport"
          type="button"
          class="dt-row is-link"
          data-testid="friend-acquire"
          @click="sheet = 'acquire'"
        >
          <span class="dt-row-main">
            <span class="dt-row-title is-strong">{{ t.acquire.cardTitle }}</span>
            <span class="dt-row-sub">{{ t.friends.rest.acquireSub }}</span>
          </span>
        </button>
      </div>
    </template>

    <!-- 点一张桌子 -->
    <DtSheet
      :open="!!picked && rest.isFriend"
      :title="picked ? t.friends.rest.tableTitle(picked.no, tableState) : ''"
      @close="picked = null"
    >
      <template v-if="picked">
        <div class="dt-detail-head">
          <span class="dt-detail-art dt-table-no-big">{{ picked.no }}</span>
          <p class="dt-detail-info dt-table-note">
            <template v-if="isEmpty(picked)">{{ t.friends.rest.emptyNote }}</template>
            <!-- 同一家好友店每人每天灭的只数有上限（问题记录 374）：灭够了不放按钮，写明原因 -->
            <span
              v-else-if="picked.customer === 3 && picked.roachBy !== mine && rest.killLeft === 0"
              data-testid="kill-done"
              >{{ t.friends.rest.killDone }}</span
            >
            <span
              v-else-if="picked.customer === 3 && picked.roachBy !== mine && rest.killLeft !== null"
              data-testid="kill-left"
              >{{ t.friends.rest.roachNote }} {{ t.friends.rest.killLeft(rest.killLeft) }}</span
            >
            <!-- 自己放的蟑螂要写明原因，不写笼统的“不能操作”（问题记录 374） -->
            <span v-else-if="picked.customer === 3 && picked.roachBy === mine" data-testid="own-roach">{{
              t.friends.rest.ownRoach
            }}</span>
            <template v-else-if="picked.customer === 3">{{ t.friends.rest.roachNote }}</template>
            <template v-else>{{ t.friends.rest.tableLocked }}</template>
          </p>
        </div>
      </template>
      <template #actions>
        <div v-if="picked && isEmpty(picked)" class="dt-sheet-pair">
          <button
            type="button"
            class="btn btn-light text-danger"
            data-testid="act-lay"
            :disabled="busy"
            @click="
              act(
                () => endpoints.roachLay(restId, picked!.no),
                t.friends.rest.roachLaid,
                t.friends.rest.layFailed,
              )
            "
          >
            {{ t.friends.rest.lay }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="act-dine"
            :disabled="busy"
            @click="
              act(
                () => endpoints.dineStart(restId, picked!.no),
                t.friends.rest.dineStarted,
                t.friends.rest.dineFailed,
              )
            "
          >
            {{ t.friends.rest.dine }}
          </button>
        </div>
        <div
          v-else-if="picked && picked.customer === 3 && picked.roachBy !== mine && rest.killLeft !== 0"
          class="dt-sheet-pair"
        >
          <button type="button" class="btn btn-light" @click="picked = null">{{ t.common.close }}</button>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="act-kill"
            :disabled="busy"
            @click="
              act(
                () => endpoints.roachKill(restId, picked!.no),
                t.friends.rest.roachKilled,
                t.friends.rest.killFailed,
              )
            "
          >
            {{ t.friends.rest.kill }}
          </button>
        </div>
        <button v-else type="button" class="btn btn-light dt-btn-block" @click="picked = null">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>

    <DtSheet :open="sheet === 'notice'" :title="t.friends.rest.noticeTitle" @close="sheet = null">
      <div class="dt-friend-notice" data-testid="friend-notice-body">
        {{ restNotice(rest.id, rest.notice) }}
      </div>
      <div v-if="canReport" class="text-end mt-2">
        <ReportButton target-type="notice" :target-id="rest.id" testid="notice-report" />
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="sheet = null">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>

    <!-- 每个部位一行，强化等级单独标出（问题记录 323） -->
    <DtSheet
      :open="sheet === 'equips'"
      :title="t.friends.rest.equipsOf(restName(rest.id, rest.name))"
      @close="sheet = null"
    >
      <div class="dt-card dt-rows-card" data-testid="friend-equips-list">
        <DtRow
          v-for="(e, i) in equips"
          :key="`${e.part}-${i}`"
          strong
          :data-testid="`friend-equip-${e.part}`"
        >
          <template #icon><DtArt :name="catalog.goodsArt(e.goodsId)" :size="26" /></template>
          <template #title>{{ equipName(catalog, e) }}</template>
          <template #sub>{{ PART_NAMES[e.part] }}</template>
          <template v-if="e.stress > 0" #end
            ><span class="dt-tag dt-tag-primary">+{{ e.stress }}</span></template
          >
        </DtRow>
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="sheet = null">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>

    <DtSheet :open="sheet === 'acquire'" :title="t.acquire.cardTitle" @close="sheet = null">
      <AcquireCard v-if="sheet === 'acquire'" :rest-id="rest.id" />
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="sheet = null">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>

    <!-- 顶栏“⋯”：举报店名、删除好友 -->
    <DtSheet :open="sheet === 'menu'" :title="restName(rest.id, rest.name)" @close="sheet = null">
      <div class="dt-menu">
        <!-- 蟹老板（NPC 店）不能举报，点了会被拒（backlog 6B-1） -->
        <div v-if="canReport" class="dt-menu-row is-static">
          <i class="bi bi-flag" aria-hidden="true"></i>
          <ReportButton target-type="rest_name" :target-id="rest.id" testid="rest-name-report" />
        </div>
        <button
          v-if="canRemove"
          type="button"
          class="dt-menu-row is-danger"
          :disabled="busy"
          data-testid="remove-friend"
          @click="remove"
        >
          <i class="bi bi-person-dash" aria-hidden="true"></i>{{ t.friends.rest.remove }}
        </button>
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="sheet = null">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>
  </template>
  <DtSkeleton v-else-if="!error" :rows="6" />
</template>
