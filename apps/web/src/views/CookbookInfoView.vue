<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { CookbookDetailDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, TASTE_NAMES } from '../utils/labels';

const route = useRoute();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const d = ref<CookbookDetailDto | null>(null);
const busy = ref(false);
const id = Number(route.params.id);

async function load() {
  d.value = await endpoints.cookbookDetail(id);
}
async function learn() {
  busy.value = true;
  try {
    await endpoints.learn(id);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.cookbook.learnFailed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.cookbook.loadFailed), 'danger')));
</script>

<template>
  <div v-if="d">
    <h5>
      {{ d.name }} <span class="dt-tag">{{ GRADE_NAMES[d.grade] }}</span>
    </h5>
    <div class="small text-muted mb-2">
      {{
        t.cookbook.info(
          d.streetName,
          d.level,
          d.taste.map((x) => TASTE_NAMES[x]).join(t.events.sep),
          formatNum(d.coin),
        )
      }}
    </div>
    <button
      class="btn btn-sm btn-primary mb-2"
      :disabled="busy || d.learn === 'z' || d.learn === 'max'"
      @click="learn"
    >
      {{ d.grade === 0 ? t.cookbook.learn : t.cookbook.upgrade }}
    </button>
    <table class="table table-sm small">
      <thead>
        <tr>
          <th>{{ t.cookbook.grade }}</th>
          <th>{{ t.cookbook.foodsNeeded }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="g in d.grades" :key="g.grade" :class="{ 'table-success': g.grade <= d.grade }">
          <td>{{ GRADE_NAMES[g.grade] ?? g.name }}</td>
          <td>
            <span
              v-for="f in g.foods"
              :key="f.foodsId"
              :class="['me-2', f.have >= f.num ? '' : 'text-danger']"
            >
              {{ catalog.foodName(f.foodsId) }}×{{ f.num }}（{{ f.have }}）
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
