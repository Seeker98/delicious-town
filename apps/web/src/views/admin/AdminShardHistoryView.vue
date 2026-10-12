<script setup lang="ts">
import { adminTime } from '../../utils/gameInput';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { ShardHistoryDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import DtSheet from '../../components/DtSheet.vue';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';

const route = useRoute();
const admin = useAdminStore();
const toast = useToastStore();
const shardId = computed(() => Number(route.params.id));
const shardName = computed(
  () => admin.shards.find((s) => s.id === shardId.value)?.name ?? `区服 ${shardId.value}`,
);
const rows = ref<ShardHistoryDto[]>([]);

async function load() {
  try {
    rows.value = await adminApi.history(shardId.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取历史失败'), 'danger');
  }
}
watch(shardId, load, { immediate: true });

/** 回滚（界面改版 P12）：面板里写说明再确认，不再用浏览器的输入框 */
const target = ref<number | null>(null);
const note = ref('');
const busy = ref(false);
function ask(version: number) {
  target.value = version;
  note.value = '';
}
async function rollback() {
  const version = target.value;
  if (version === null || !note.value.trim() || busy.value) return;
  busy.value = true;
  try {
    const r = await adminApi.rollback(shardId.value, { version, note: note.value.trim() });
    toast.push(`已回滚，当前版本 ${r.version}`);
    target.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '回滚失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead title="修改历史" :desc="`${shardName} · 每次保存一版, 可以回滚到以前的某一版`">
      <template #crumb
        ><RouterLink :to="`/admin/shards/${shardId}`">区服数值</RouterLink> › 修改历史</template
      >
      <RouterLink :to="`/admin/shards/${shardId}`" class="dt-adm-btn is-s">返回数值</RouterLink>
    </AdmHead>
    <AdmBox flush>
      <div class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>版本</th>
              <th>时间</th>
              <th>操作人</th>
              <th>说明</th>
              <th>改动</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rows" :key="r.version">
              <td class="dt-adm-mono dt-adm-mu">{{ r.version }}</td>
              <td class="dt-adm-mu nowrap">{{ adminTime(r.at) }}</td>
              <td>{{ r.actor ?? '—' }}</td>
              <td>{{ r.note }}</td>
              <td class="dt-adm-mono dt-adm-hist-changed">{{ r.changed.join('、') || '（无）' }}</td>
              <td class="acts">
                <button
                  v-if="admin.isAdmin && i > 0"
                  type="button"
                  class="dt-adm-btn is-d is-sm"
                  :data-testid="`rollback-${r.version}`"
                  @click="ask(r.version)"
                >
                  回滚到此版…
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <AdmEmpty v-if="rows.length === 0" title="还没有修改记录" text="在区服数值页保存一次就会记一版" />
    </AdmBox>
    <DtSheet :open="target !== null" :title="`回滚到版本 ${target}`" @close="target = null">
      <p class="dt-sheet-text">回滚后数值变成那一版的样子，并新记一版历史；所有进程立即生效。</p>
      <input
        v-model="note"
        class="dt-adm-in dt-adm-full"
        placeholder="回滚说明 (必填)"
        data-testid="rollback-note"
      />
      <template #actions>
        <button type="button" class="btn btn-outline-secondary" @click="target = null">取消</button>
        <button
          type="button"
          class="btn btn-outline-danger"
          :disabled="busy || !note.trim()"
          data-testid="rollback-ok"
          @click="rollback"
        >
          回滚
        </button>
      </template>
    </DtSheet>
  </div>
</template>
