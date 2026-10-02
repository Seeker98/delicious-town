<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { checkRestaurantName } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage, errorText } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const name = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();
const t = useT();

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
    error.value = errorMessage(e, t.value.auth.createFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">{{ t.auth.createTitle }}</h5>
      <p class="small text-muted">{{ t.auth.createHint }}</p>
      <form @submit.prevent="submit">
        <input v-model="name" class="form-control mb-2" :placeholder="t.auth.restName" maxlength="32" />
        <div v-if="localError || error" class="alert alert-danger py-1" data-testid="name-error">
          {{ localError || error }}
        </div>
        <button class="btn btn-primary w-100" :disabled="busy">{{ t.auth.open }}</button>
      </form>
    </div>
  </div>
</template>
