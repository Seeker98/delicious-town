<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';

const route = useRoute();
const password = ref('');
const password2 = ref('');
const done = ref(false);
const error = ref('');
const busy = ref(false);
const t = useT();
const localError = computed(() => {
  if (password.value && password.value.length < 6) return t.value.auth.passwordMin;
  if (password2.value && password.value !== password2.value) return t.value.auth.passwordMismatch;
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : '';
    await endpoints.resetPassword({ token, password: password.value });
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e, t.value.auth.resetFailed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">{{ t.auth.resetTitle }}</h5>
      <p v-if="done" class="text-success">{{ t.auth.resetDone }}</p>
      <form v-else @submit.prevent="submit">
        <input
          v-model="password"
          type="password"
          class="form-control mb-2"
          :placeholder="t.auth.newPassword"
          autocomplete="new-password"
          required
        />
        <input
          v-model="password2"
          type="password"
          class="form-control mb-2"
          :placeholder="t.auth.newPassword2"
          autocomplete="new-password"
          required
        />
        <div v-if="localError || error" class="alert alert-danger py-1">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">{{ t.common.confirm }}</button>
      </form>
      <div class="mt-2 small">
        <RouterLink to="/login">{{ t.auth.goLogin }}</RouterLink>
      </div>
    </div>
  </div>
</template>
