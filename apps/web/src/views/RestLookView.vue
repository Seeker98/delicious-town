<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { MyLooksDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const looks = computed(() => catalog.looks);
const mine = ref<MyLooksDto | null>(null);
const notice = ref('');
const busy = ref(false);

async function load() {
  try {
    mine.value = await endpoints.myLooks();
    notice.value = mine.value.notice;
  } catch (e) {
    toast.push(errorMessage(e, '读取装扮失败'), 'danger');
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

onMounted(async () => {
  await catalog.load().catch(() => undefined);
  await load();
});
</script>

<template>
  <h5>装扮</h5>
  <template v-if="mine">
    <h6>头像</h6>
    <p v-if="mine.avatar === null" class="small text-danger">还没有设置头像（去好友店里白食需要头像）</p>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="a in looks?.avatars ?? []"
        :key="a.id"
        :class="['btn btn-sm', mine.avatar === a.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`avatar-${a.id}`"
        :disabled="busy"
        @click="act(() => endpoints.setAvatar(a.id), '头像已更换', '更换头像失败')"
      >
        <GameImg :path="`avatar/${a.id}`" :alt="a.name" fallback-icon="bi-person-circle" /> {{ a.name }}
      </button>
    </div>

    <h6>门</h6>
    <div class="d-flex flex-wrap gap-1 mb-3">
      <button
        v-for="d in looks?.doors ?? []"
        :key="d.id"
        :class="['btn btn-sm', mine.door === d.id ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`door-${d.id}`"
        :disabled="busy || mine.door === d.id"
        @click="act(() => endpoints.setDoor(d.id), '换门成功', '换门失败')"
      >
        {{ d.name }}<span v-if="d.coin > 0" class="ms-1 small">{{ formatNum(d.coin) }} 银</span>
      </button>
    </div>

    <h6>公告栏</h6>
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
        @click="act(() => endpoints.setNotice(notice), '公告已保存', '保存公告失败')"
      >
        保存
      </button>
    </div>

    <h6>个性图标（最多展示 5 个）</h6>
    <p v-if="mine.icons.length === 0" class="small text-muted">还没有个性图标。</p>
    <div v-for="i in mine.icons" :key="i.id" class="form-check">
      <input
        :id="`icon-${i.id}`"
        class="form-check-input"
        type="checkbox"
        :checked="i.shown"
        :data-testid="`icon-${i.id}`"
        :disabled="busy"
        @change="act(() => endpoints.iconShow(i.id, !i.shown), '已更新', '更新图标失败')"
      />
      <label class="form-check-label" :for="`icon-${i.id}`"
        >{{ i.title }} <span class="small text-muted">{{ i.desc }}</span></label
      >
    </div>
  </template>
</template>
