<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { gameDateTime } from '../utils/format';
import type { MailDto, RewardItems } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useMailStore } from '../stores/mail';
import { useToastStore } from '../stores/toast';
import { rewardChips, rewardSummary } from '../utils/reward';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import DtRow from '../components/DtRow.vue';
import DtSheet from '../components/DtSheet.vue';
import { mailBody, mailTitle } from '../utils/serverText';
import { serverNowMs } from '../utils/serverNow';

/**
 * 邮箱（子项目 6A；界面改版 P10）：上面一行去兑换码页；一封一行（没读的加粗、紫点，附件写成小胶囊，右边领取或删除），
 * 点一封从下面弹出正文
 */
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const mailStore = useMailStore();
const items = ref<MailDto[]>([]);
const loaded = ref(false);
const open = ref<number | null>(null);
const busy = ref(false);
/** 一键领取有没领成的，写在页面上（不用弹出提示，免得一闪而过） */
const notice = ref('');
/** 当前等级用邮箱接口给的，刷新页面直接进邮箱、或者刚领了经验后都是准的（终审 I1） */
const level = ref(0);

let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const r = await endpoints.mail();
    if (mine !== seq) return;
    items.value = r.items;
    level.value = r.level;
    loaded.value = true;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.mail.loadFailed), 'danger');
  }
}
onMounted(() => {
  void catalog.load();
  void load();
});

const hasItems = (m: MailDto) => m.items !== null && Object.keys(m.items).length > 0;
const claimable = (m: MailDto) => hasItems(m) && !m.claimed && !m.broken;
const levelLow = (m: MailDto) => m.minLevel !== null && level.value < m.minLevel;
const anyClaimable = computed(() => items.value.some((m) => claimable(m) && !levelLow(m)));
const daysLeft = (m: MailDto) =>
  Math.max(0, Math.ceil((new Date(m.expiresAt).getTime() - serverNowMs()) / 86_400_000));
const sentAt = (m: MailDto) =>
  gameDateTime(m.createdAt, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

async function run(fn: () => Promise<unknown>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
    await load();
    void mailStore.refresh({ force: true });
  }
}

const opened = computed(() => items.value.find((m) => m.id === open.value) ?? null);
const chips = (m: MailDto) =>
  m.items
    ? rewardChips(m.items, {
        goodsName: (id) => catalog.goodsName(id),
        foodName: (id) => catalog.foodName(id),
        goodsArt: (id) => catalog.goodsArt(id),
        foodArt: (id) => catalog.foodArt(id),
        icon: (key) => catalog.icon(key),
      })
    : [];
async function show(m: MailDto) {
  open.value = m.id;
  if (!m.read) {
    m.read = true;
    try {
      await endpoints.mailRead(m.id);
      void mailStore.refresh({ force: true });
    } catch {
      // 标记已读失败不影响看信
    }
  }
}
/** 领到的称号已过期（定制称号设计 四）：领取结果里标了 expired，提示一下，不然玩家看不出为什么没拿到 */
function warnExpired(list: RewardItems[]) {
  const expired = list.flatMap((i) => (i.icons ?? []).filter((c) => c.expired));
  if (expired.length > 0) toast.push(rewardSummary({ icons: expired }, catalog), 'info');
}
const claim = (m: MailDto) =>
  run(async () => {
    warnExpired([(await endpoints.mailClaim(m.id)).items]);
  }, t.value.mail.claimFailed);
const remove = (m: MailDto) =>
  run(async () => {
    await endpoints.mailDelete(m.id);
    if (open.value === m.id) open.value = null;
  }, t.value.mail.deleteFailed);
const claimAll = () =>
  run(async () => {
    const r = await endpoints.mailClaimAll();
    warnExpired(r.items);
    notice.value = r.failed > 0 ? t.value.mail.claimAllPartial(r.claimed, r.failed) : '';
  }, t.value.mail.claimFailed);
</script>

<template>
  <!-- 兑换码只留在兑换码页（界面改版 P2b）；这里一行入口 -->
  <div class="dt-card dt-rows-card">
    <DtRow
      to="/redeem"
      strong
      :title="t.misc.redeem.title"
      :sub="t.mail.redeemSub"
      data-testid="mail-to-redeem"
    >
      <template #icon><DtArt name="res-ticket" :size="26" /></template>
    </DtRow>
  </div>
  <div class="dt-block-head mt-3">
    <h2 class="dt-block-title">{{ t.mail.listTitle }}</h2>
    <span v-if="loaded && items.length > 0" class="dt-block-more">{{
      t.mail.countLine(items.length, items.filter((m) => claimable(m) && !levelLow(m)).length)
    }}</span>
    <button
      v-if="anyClaimable"
      type="button"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy"
      data-testid="mail-claim-all"
      @click="claimAll"
    >
      {{ t.mail.claimAll }}
    </button>
  </div>
  <div v-if="notice" class="dt-block-note text-danger" role="status">{{ notice }}</div>
  <DtEmpty
    v-if="loaded && items.length === 0"
    art="empty-mail"
    :title="t.mail.empty"
    :body="t.mail.emptyBody"
  />
  <div v-else-if="items.length > 0" class="dt-card dt-rows-card" data-testid="mail-list">
    <div
      v-for="m in items"
      :key="m.id"
      :class="['dt-mail-row', { 'is-unread': !m.read }]"
      :data-testid="`mail-${m.id}`"
    >
      <button
        type="button"
        class="dt-mail-open"
        :aria-label="t.mail.openLabel(mailTitle(m))"
        :data-testid="`mail-title-${m.id}`"
        @click="show(m)"
      >
        <span class="dt-mail-ico"
          ><DtArt
            :name="hasItems(m) && !m.claimed ? 'goods-gift' : m.read ? 'town-mail-open' : 'town-mail'"
            :size="24" /><span v-if="!m.read" class="dt-mail-dot"></span
        ></span>
        <span class="dt-mail-main">
          <span class="dt-mail-title">{{ mailTitle(m) }}</span>
          <span class="dt-mail-meta">{{ sentAt(m) }}{{ t.mail.daysLeft(daysLeft(m)) }}</span>
          <span v-if="hasItems(m)" class="dt-mail-chips">
            <span v-for="(c, i) in chips(m)" :key="i" class="dt-mail-chip"
              ><span class="dt-mail-chip-art"
                ><DtArt v-if="c.art" :name="c.art" :size="16" /><b v-else aria-hidden="true">{{
                  t.mail.iconMark
                }}</b></span
              >{{ c.text }}</span
            >
          </span>
        </span>
      </button>
      <span class="dt-mail-act">
        <button
          v-if="claimable(m) && !levelLow(m)"
          type="button"
          class="btn btn-sm btn-primary"
          :disabled="busy"
          :data-testid="`mail-claim-${m.id}`"
          @click="claim(m)"
        >
          {{ t.mail.claim }}
        </button>
        <span v-else-if="claimable(m)" class="dt-tag dt-tag-danger" :data-testid="`mail-level-${m.id}`">{{
          t.mail.needLevelTag(m.minLevel ?? 0)
        }}</span>
        <span v-else-if="m.claimed" class="dt-tag dt-tag-ok">{{ t.mail.claimedTag }}</span>
        <span v-else-if="m.broken" class="dt-tag dt-tag-danger">{{ t.mail.brokenTag }}</span>
        <button
          v-else
          type="button"
          class="btn btn-sm btn-light"
          :disabled="busy"
          :data-testid="`mail-delete-${m.id}`"
          @click="remove(m)"
        >
          {{ t.mail.delete }}
        </button>
      </span>
    </div>
  </div>

  <!-- 点一封从下面弹出：正文、附件、领取或删除 -->
  <DtSheet :open="!!opened" :title="opened ? mailTitle(opened) : ''" @close="open = null">
    <template v-if="opened">
      <div class="dt-detail-head">
        <span class="dt-detail-art"
          ><DtArt :name="hasItems(opened) && !opened.claimed ? 'goods-gift' : 'town-mail-open'" :size="52"
        /></span>
        <div class="dt-detail-info">
          <div>{{ sentAt(opened) }}</div>
          <div class="dt-detail-sub">{{ t.mail.expires(daysLeft(opened)) }}</div>
        </div>
      </div>
      <div class="dt-mail-body" :data-testid="`mail-body-${opened.id}`">{{ mailBody(opened) }}</div>
      <template v-if="hasItems(opened)">
        <div class="dt-field-label-top">{{ t.mail.itemsTitle }}</div>
        <div class="dt-award-chips">
          <span v-for="(c, i) in chips(opened)" :key="i" class="dt-mail-chip is-big"
            ><span class="dt-mail-chip-art"
              ><DtArt v-if="c.art" :name="c.art" :size="20" /><b v-else aria-hidden="true">{{
                t.mail.iconMark
              }}</b></span
            >{{ c.text }}</span
          >
        </div>
        <p v-if="opened.claimed" class="dt-detail-note">{{ t.mail.claimedTag }}</p>
        <p v-else-if="opened.broken" class="dt-detail-note text-danger">{{ t.mail.broken }}</p>
        <p v-else-if="levelLow(opened)" class="dt-detail-note text-danger">
          {{ t.mail.needLevel(opened.minLevel ?? 0) }}
        </p>
      </template>
    </template>
    <template #actions>
      <div v-if="opened && claimable(opened)" class="dt-sheet-pair">
        <button type="button" class="btn btn-light" :disabled="busy" @click="remove(opened)">
          {{ t.mail.delete }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || levelLow(opened)"
          data-testid="mail-sheet-claim"
          @click="claim(opened)"
        >
          {{ t.mail.claim }}
        </button>
      </div>
      <div v-else class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="open = null">{{ t.common.close }}</button>
        <button
          v-if="opened"
          type="button"
          class="btn btn-outline-danger"
          :disabled="busy"
          data-testid="mail-sheet-delete"
          @click="remove(opened)"
        >
          {{ t.mail.delete }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
