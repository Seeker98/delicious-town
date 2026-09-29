<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { checkRestaurantName } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage, errorText } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const name = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();

const localError = computed(() => {
  if (!name.value) return '';
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
    error.value = errorMessage(e, '开店失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">开一家餐厅</h5>
      <p class="small text-muted">名称最多 8 个汉字或 12 个字母数字，开张后在新手街营业。</p>
      <form @submit.prevent="submit">
        <input v-model="name" class="form-control mb-2" placeholder="餐厅名称" maxlength="32" />
        <div v-if="localError || error" class="alert alert-danger py-1" data-testid="name-error">
          {{ localError || error }}
        </div>
        <button class="btn btn-primary w-100" :disabled="busy">开张</button>
      </form>
    </div>
  </div>
</template>
