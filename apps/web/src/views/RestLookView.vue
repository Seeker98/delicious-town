<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MyLooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { remainText } from '../utils/remain';
import { serverNowMs } from '../utils/serverNow';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const looks = computed(() => catalog.looks);
const mine = ref<MyLooksDto | null>(null);
const notice = ref('');
const busy = ref(false);

async function load() {
  try {
    mine.value = await endpoints.myLooks();
    notice.value = mine.value.notice;
  } catch (e) {
    toast.push(errorMessage(e, t.value.rest.look.loadFailed), 'danger');
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

/** 限定称号（240-2）：还剩几天下架，不足一天算 0（显示“今天下架”） */
function daysLeft(endsAt: string): number {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - serverNowMs()) / 86_400_000));
}

/** 个性图标最多展示几个（服务器同样限制） */
const ICON_MAX = 5;
const shownCount = computed(() => mine.value?.icons.filter((i) => i.shown).length ?? 0);
/** 展示中的排前面；超过 8 个时只列展示中的和前几个没展示的，其余收起（界面改版 P7） */
const ICON_ROWS = 8;
const iconsAll = ref(false);
const iconsSorted = computed(() => {
  const list = mine.value?.icons ?? [];
  return [...list.filter((i) => i.shown), ...list.filter((i) => !i.shown)];
});
const iconsVisible = computed(() =>
  iconsAll.value || iconsSorted.value.length <= ICON_ROWS
    ? iconsSorted.value
    : iconsSorted.value.slice(0, Math.max(ICON_ROWS - 1, shownCount.value)),
);
const iconsHidden = computed(() => iconsSorted.value.length - iconsVisible.value.length);

const confirm = useConfirmStore();
async function buyIcon(key: string, fallbackTitle: string, coin: number) {
  const title = catalog.icon(key)?.title ?? fallbackTitle;
  const yes = await confirm.ask({
    title: t.value.rest.look.buyConfirm(title, formatNum(coin)),
    ok: t.value.rest.look.buy,
  });
  if (!yes) return;
  void act(() => endpoints.iconBuy(key), t.value.rest.look.bought(title), t.value.rest.look.buyFailed);
}

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
</script>

<template>
  <template v-if="mine">
    <!-- 头像（界面改版 P7）：12 个头像画成图，6 列格子，选中的紫边；没设头像时上面一张提醒行 -->
    <section class="dt-block mt-2">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.look.avatar }}</h2>
      </div>
      <div v-if="mine.avatar === null" class="dt-card dt-rows-card mb-2" data-testid="no-avatar">
        <div class="dt-row">
          <span class="dt-row-main"
            ><span class="dt-row-title">{{ t.rest.look.noAvatarTitle }}</span
            ><span class="dt-row-sub">{{ t.rest.look.noAvatarSub }}</span></span
          >
          <span class="dt-row-end"
            ><span class="dt-tag dt-tag-warn">{{ t.rest.look.noAvatarTag }}</span></span
          >
        </div>
      </div>
      <div class="dt-avatar-grid" role="group" :aria-label="t.rest.look.avatar">
        <button
          v-for="a in looks?.avatars ?? []"
          :key="a.id"
          type="button"
          class="dt-avatar-tile"
          :aria-pressed="mine.avatar === a.id"
          :data-testid="`avatar-${a.id}`"
          :disabled="busy"
          @click="act(() => endpoints.setAvatar(a.id), t.rest.look.avatarSet, t.rest.look.avatarFailed)"
        >
          <DtArt v-if="catalog.avatarArt(a.id)" :name="catalog.avatarArt(a.id)!" :size="40" />
          <span class="dt-avatar-name">{{ a.name }}</span>
        </button>
      </div>
    </section>

    <!-- 门：4 列门图格子，下面一个状态小标签（使用中 / 已拥有 / 价格） -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.look.door }}</h2>
      </div>
      <p class="dt-block-note">{{ t.rest.look.doorHint }}</p>
      <div class="dt-door-grid" role="group" :aria-label="t.rest.look.door">
        <button
          v-for="d in looks?.doors ?? []"
          :key="d.id"
          type="button"
          class="dt-door-tile"
          :aria-pressed="mine.door === d.id"
          :data-testid="`door-${d.id}`"
          :disabled="busy || mine.door === d.id"
          @click="act(() => endpoints.setDoor(d.id), t.rest.look.doorSet, t.rest.look.doorFailed)"
        >
          <DtArt :name="catalog.doorArt(d.id)" :size="40" />
          <span class="dt-avatar-name">{{ d.name }}</span>
          <!-- 买过的门换回来免费（问题记录 350） -->
          <span v-if="mine.door === d.id" class="dt-tag dt-tag-primary">{{ t.rest.look.doorInUse }}</span>
          <span v-else-if="d.coin === 0 || mine.ownedDoors.includes(d.id)" class="dt-tag dt-tag-mute">{{
            t.rest.look.doorOwned
          }}</span>
          <span v-else class="dt-tag dt-tag-mute">{{ t.rest.look.doorCoin(formatNum(d.coin)) }}</span>
        </button>
      </div>
    </section>

    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.look.notice }}</h2>
        <span class="dt-block-more">{{ t.rest.look.noticeHint }}</span>
      </div>
      <div class="dt-card dt-notice-card">
        <textarea
          v-model="notice"
          class="form-control"
          rows="3"
          maxlength="200"
          :aria-label="t.rest.look.notice"
          data-testid="notice"
        ></textarea>
        <div class="dt-notice-foot">
          <span class="dt-meta">{{ notice.length }}/200</span>
          <button
            class="btn btn-sm btn-primary"
            data-testid="save-notice"
            :disabled="busy"
            @click="act(() => endpoints.setNotice(notice), t.rest.look.noticeSaved, t.rest.look.noticeFailed)"
          >
            {{ t.rest.look.save }}
          </button>
        </div>
      </div>
    </section>

    <!-- 限定称号：一行一个，名字是黄底徽章；没买的右边是菜场那种价格按钮，买过的是“已拥有”小标签 -->
    <section v-if="(mine.shop ?? []).length > 0" class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.look.shopTitle }}</h2>
      </div>
      <div class="dt-card dt-rows-card" data-testid="icon-shop">
        <div v-for="s in mine.shop" :key="s.key" class="dt-row dt-row-wrap">
          <span class="dt-row-main">
            <span class="dt-row-title"
              ><span class="dt-title-badge">{{ catalog.icon(s.key)?.title ?? s.title }}</span></span
            >
            <span class="dt-row-sub">{{
              t.rest.look.shopSub(catalog.icon(s.key)?.desc ?? s.desc, daysLeft(s.endsAt))
            }}</span>
          </span>
          <span class="dt-row-end">
            <span v-if="s.owned" class="dt-tag dt-tag-mute" :data-testid="`icon-buy-${s.key}`">{{
              t.rest.look.owned
            }}</span>
            <button
              v-else
              type="button"
              class="dt-price-btn"
              :aria-label="t.rest.look.buyLabel(catalog.icon(s.key)?.title ?? s.title, formatNum(s.coin))"
              :data-testid="`icon-buy-${s.key}`"
              :disabled="busy"
              @click="buyIcon(s.key, s.title, s.coin)"
            >
              <DtArt name="res-coin-silver" :size="16" />{{ formatNum(s.coin) }}
            </button>
          </span>
        </div>
      </div>
    </section>

    <!-- 个性图标：一行一个开关，展示中的排前面；多的收起来 -->
    <section class="dt-block">
      <div class="dt-block-head">
        <h2 class="dt-block-title">{{ t.rest.look.iconsTitle }}</h2>
        <span v-if="mine.icons.length > 0" class="dt-block-more" data-testid="icons-shown">{{
          t.rest.look.iconsShown(shownCount, ICON_MAX)
        }}</span>
      </div>
      <p v-if="mine.icons.length === 0" class="dt-block-note">{{ t.rest.look.noIcons }}</p>
      <div v-else class="dt-card dt-rows-card">
        <div v-for="i in iconsVisible" :key="i.id" class="dt-row">
          <label class="dt-row-main" :for="`icon-${i.id}`">
            <span class="dt-row-title">{{ catalog.icon(i.key)?.title ?? i.title }}</span>
            <span class="dt-row-sub"
              >{{ catalog.icon(i.key)?.desc ?? i.desc
              }}<span v-if="i.expiresAt" class="dt-row-warn" :data-testid="`icon-left-${i.id}`">
                · {{ remainText(i.expiresAt) }}</span
              ></span
            >
          </label>
          <span class="dt-row-end form-switch">
            <input
              :id="`icon-${i.id}`"
              class="form-check-input"
              type="checkbox"
              role="switch"
              :checked="i.shown"
              :data-testid="`icon-${i.id}`"
              :disabled="busy"
              @change="
                act(() => endpoints.iconShow(i.id, !i.shown), t.rest.look.iconUpdated, t.rest.look.iconFailed)
              "
            />
          </span>
        </div>
        <button
          v-if="iconsHidden > 0"
          type="button"
          class="dt-effects-more"
          data-testid="icons-more"
          @click="iconsAll = true"
        >
          {{ t.rest.look.iconsMore(iconsHidden) }}
        </button>
      </div>
    </section>
  </template>
</template>
