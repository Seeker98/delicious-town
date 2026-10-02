<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
const t = useT();
const name = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    const r = await endpoints.rename(name.value.trim());
    toast.push(t.value.society.rename.done(r.name));
    name.value = '';
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.rename.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h5>{{ t.society.rename.title }}</h5>
  <p class="small text-muted">
    {{ t.society.rename.hint }}
  </p>
  <form @submit.prevent="submit">
    <input
      v-model="name"
      class="form-control mb-2"
      :placeholder="t.society.rename.placeholder"
      maxlength="32"
    />
    <button class="btn btn-primary w-100" :disabled="busy || !name.trim()">
      {{ t.society.rename.btn }}
    </button>
  </form>
</template>
