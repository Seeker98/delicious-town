<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

const toast = useToastStore();
const name = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  try {
    const r = await endpoints.rename(name.value.trim());
    toast.push(`已改名为「${r.name}」`);
    name.value = '';
  } catch (e) {
    toast.push(errorMessage(e, '改名失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h5>改名</h5>
  <p class="small text-muted">
    需要 1 张改名卡。新名字最多 9 个字，只能用中文、字母和数字，不能和本服其他餐厅重名。
  </p>
  <form @submit.prevent="submit">
    <input v-model="name" class="form-control mb-2" placeholder="新名字" maxlength="32" />
    <button class="btn btn-primary w-100" :disabled="busy || !name.trim()">改名</button>
  </form>
</template>
