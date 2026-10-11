<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { checkRestaurantName, restaurantNameWeight } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import AuthField from '../components/auth/AuthField.vue';
import AuthScene from '../components/auth/AuthScene.vue';
import DtArt from '../components/DtArt.vue';
import { useT } from '../composables/useT';
import { errorMessage, errorText } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useShardsStore } from '../stores/shards';

/**
 * 开店（界面改版 P11）：头图是一间空店（招牌是虚线框），右上写现在在哪个区服；
 * 名字下面实时数字数（汉字算 1 个、字母数字算 5/8 个，满 8 个为止），不合规就在名字下面写红字
 */
const MAX = 8;
const name = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();
const shards = useShardsStore();
const shardName = computed(() => shards.nameOf(session.me?.shardId));
const t = useT();

onMounted(() => void shards.load());

/** 现在的长度，按汉字算（规则：汉字 8 分、字母数字 5 分，最多 64 分） */
const len = computed(() => Math.ceil(restaurantNameWeight(name.value.trim()) / 8));
const localError = computed(() => {
  if (!name.value.trim()) return '';
  const check = checkRestaurantName(name.value);
  return check === 'ok' ? '' : errorText('RESTAURANT_NAME_INVALID', { reason: check });
});

async function submit() {
  const check = checkRestaurantName(name.value);
  if (check !== 'ok') {
    error.value = errorText('RESTAURANT_NAME_INVALID', { reason: check });
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const r = await endpoints.createRestaurant(name.value.trim());
    if (session.me) session.me = { ...session.me, restaurantId: r.id };
    await router.replace({ name: 'home' });
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.createFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthScene scene="newshop">
    <template #chip>
      <span v-if="shardName" class="dt-auth-chip is-static" data-testid="create-shard">{{ shardName }}</span>
    </template>
  </AuthScene>
  <section class="dt-auth-card">
    <h2 class="dt-auth-title">{{ t.auth.createTitle }}</h2>
    <p class="dt-auth-sub">{{ t.auth.createSub }}</p>
    <form @submit.prevent="submit">
      <AuthField
        v-model="name"
        :label="t.auth.restName"
        :maxlength="32"
        :hint="t.auth.createHint"
        :error="localError || error"
        :count="`${len} / ${MAX}`"
        testid="rest-name"
      />
      <div class="dt-sum dt-auth-street">
        <span class="dt-auth-street-art"><DtArt name="wiki-streets" :size="24" /></span>
        <span
          >{{ t.auth.createStreetPre }}<b>{{ t.auth.startStreet }}</b
          >{{ t.auth.createStreetPost }}</span
        >
      </div>
      <button class="btn btn-primary dt-btn-block dt-auth-submit" :disabled="busy" data-testid="create-open">
        {{ t.auth.open }}
      </button>
    </form>
  </section>
</template>
