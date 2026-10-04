<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MyLooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

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
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 86_400_000));
}

function buyIcon(key: string, fallbackTitle: string, coin: number) {
  const title = catalog.icon(key)?.title ?? fallbackTitle;
  if (!window.confirm(t.value.rest.look.buyConfirm(title, formatNum(coin)))) return;
  void act(() => endpoints.iconBuy(key), t.value.rest.look.bought(title), t.value.rest.look.buyFailed);
}

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
</script>

<template>
  <h5>{{ t.rest.look.title }}</h5>
  <template v-if="mine">
    <h6 class="dt-section mt-0">{{ t.rest.look.avatar }}</h6>
    <p v-if="mine.avatar === null" class="small text-danger">{{ t.rest.look.noAvatar }}</p>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="a in looks?.avatars ?? []"
        :key="a.id"
        :class="['btn btn-sm', mine.avatar === a.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`avatar-${a.id}`"
        :disabled="busy"
        @click="act(() => endpoints.setAvatar(a.id), t.rest.look.avatarSet, t.rest.look.avatarFailed)"
      >
        <GameImg :path="`avatar/${a.id}`" :alt="a.name" fallback-icon="bi-person-circle" /> {{ a.name }}
      </button>
    </div>

    <h6 class="dt-section">{{ t.rest.look.door }}</h6>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="d in looks?.doors ?? []"
        :key="d.id"
        :class="['btn btn-sm', mine.door === d.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`door-${d.id}`"
        :disabled="busy || mine.door === d.id"
        @click="act(() => endpoints.setDoor(d.id), t.rest.look.doorSet, t.rest.look.doorFailed)"
      >
        {{ d.name
        }}<span v-if="d.coin > 0" class="ms-1 small">{{ t.rest.look.doorCoin(formatNum(d.coin)) }}</span>
      </button>
    </div>

    <h6 class="dt-section">{{ t.rest.look.notice }}</h6>
    <textarea
      v-model="notice"
      class="form-control mb-1"
      rows="3"
      maxlength="200"
      data-testid="notice"
    ></textarea>
    <div class="d-flex justify-content-between align-items-center mb-3">
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

    <template v-if="(mine.shop ?? []).length > 0">
      <h6 class="dt-section">{{ t.rest.look.shopTitle }}</h6>
      <div class="mb-2" data-testid="icon-shop">
        <div v-for="s in mine.shop" :key="s.key" class="dt-todo-row">
          <div class="flex-fill">
            <b>{{ catalog.icon(s.key)?.title ?? s.title }}</b>
            <span class="small text-muted">{{ catalog.icon(s.key)?.desc ?? s.desc }}</span>
            <span class="d-block dt-meta">{{
              t.rest.look.shopMeta(formatNum(s.coin), daysLeft(s.endsAt))
            }}</span>
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
    <div v-for="i in mine.icons" :key="i.id" class="form-check">
      <input
        :id="`icon-${i.id}`"
        class="form-check-input"
        type="checkbox"
        :checked="i.shown"
        :data-testid="`icon-${i.id}`"
        :disabled="busy"
        @change="
          act(() => endpoints.iconShow(i.id, !i.shown), t.rest.look.iconUpdated, t.rest.look.iconFailed)
        "
      />
      <label class="form-check-label" :for="`icon-${i.id}`"
        >{{ catalog.icon(i.key)?.title ?? i.title }}
        <span class="small text-muted">{{ catalog.icon(i.key)?.desc ?? i.desc }}</span></label
      >
    </div>
  </template>
</template>
