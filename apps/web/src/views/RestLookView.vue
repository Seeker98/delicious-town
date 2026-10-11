<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MyLooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
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
    <h6 class="dt-section mt-0">{{ t.rest.look.avatar }}</h6>
    <p v-if="mine.avatar === null" class="small text-danger">{{ t.rest.look.noAvatar }}</p>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="a in looks?.avatars ?? []"
        :key="a.id"
        type="button"
        class="dt-choice"
        :aria-pressed="mine.avatar === a.id"
        :data-testid="`avatar-${a.id}`"
        :disabled="busy"
        @click="act(() => endpoints.setAvatar(a.id), t.rest.look.avatarSet, t.rest.look.avatarFailed)"
      >
        <i class="bi bi-person-circle" aria-hidden="true"></i> {{ a.name }}
      </button>
    </div>

    <h6 class="dt-section">{{ t.rest.look.door }}</h6>
    <div class="dt-meta mb-1">{{ t.rest.look.doorHint }}</div>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="d in looks?.doors ?? []"
        :key="d.id"
        type="button"
        class="dt-choice"
        :aria-pressed="mine.door === d.id"
        :data-testid="`door-${d.id}`"
        :disabled="busy || mine.door === d.id"
        @click="act(() => endpoints.setDoor(d.id), t.rest.look.doorSet, t.rest.look.doorFailed)"
      >
        {{ d.name }}<!-- 买过的门换回来免费（问题记录 350） --><span
          v-if="d.coin > 0 && mine.ownedDoors.includes(d.id)"
          class="ms-1 small"
          >{{ t.rest.look.doorOwned }}</span
        ><span v-else-if="d.coin > 0" class="ms-1 small">{{ t.rest.look.doorCoin(formatNum(d.coin)) }}</span>
      </button>
    </div>

    <h6 class="dt-section">{{ t.rest.look.notice }}</h6>
    <div class="dt-card mb-3">
      <textarea
        v-model="notice"
        class="form-control mb-1"
        rows="3"
        maxlength="200"
        data-testid="notice"
      ></textarea>
      <div class="d-flex justify-content-between align-items-center">
        <span class="small text-muted">{{ notice.length }}/200</span>
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

    <template v-if="(mine.shop ?? []).length > 0">
      <h6 class="dt-section">{{ t.rest.look.shopTitle }}</h6>
      <div class="dt-card mb-3" data-testid="icon-shop">
        <div v-for="s in mine.shop" :key="s.key" class="dt-item">
          <div class="dt-item-main">
            <div class="dt-item-title">{{ catalog.icon(s.key)?.title ?? s.title }}</div>
            <div class="small text-muted">{{ catalog.icon(s.key)?.desc ?? s.desc }}</div>
            <div class="dt-meta">{{ t.rest.look.shopMeta(formatNum(s.coin), daysLeft(s.endsAt)) }}</div>
          </div>
          <button
            class="btn btn-sm btn-primary"
            :data-testid="`icon-buy-${s.key}`"
            :disabled="busy || s.owned"
            @click="buyIcon(s.key, s.title, s.coin)"
          >
            {{ s.owned ? t.rest.look.owned : t.rest.look.buy }}
          </button>
        </div>
      </div>
    </template>

    <h6 class="dt-section">{{ t.rest.look.icons }}</h6>
    <p v-if="mine.icons.length === 0" class="small text-muted">{{ t.rest.look.noIcons }}</p>
    <div v-else class="dt-card">
      <div v-for="i in mine.icons" :key="i.id" class="dt-item form-switch dt-switch-row">
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
        <label class="form-check-label" :for="`icon-${i.id}`"
          >{{ catalog.icon(i.key)?.title ?? i.title }}
          <span class="small text-muted">{{ catalog.icon(i.key)?.desc ?? i.desc }}</span>
          <span v-if="i.expiresAt" class="small text-warning ms-1" :data-testid="`icon-left-${i.id}`">{{
            remainText(i.expiresAt)
          }}</span></label
        >
      </div>
    </div>
  </template>
</template>
