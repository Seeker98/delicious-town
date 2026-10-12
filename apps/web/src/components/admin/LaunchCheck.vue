<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LaunchCheckDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';

/**
 * 上线检查（子项目 6B-2，设计 §7）：开发期关掉的开关，管理员一键改成上线值。
 * 界面改版 P12：琥珀提示块里按区服一张小表，字段名等宽、现在值和应为值、为什么；每个区服右边一个按钮
 */
const admin = useAdminStore();
const toast = useToastStore();
const confirm = useConfirmStore();
const data = ref<LaunchCheckDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await adminApi.launchCheck();
  } catch (e) {
    toast.push(errorMessage(e, '读取上线检查失败'), 'danger');
  }
}
onMounted(load);

const failing = (s: LaunchCheckDto['shards'][number]) => s.items.filter((i) => !i.ok);

async function fix(s: LaunchCheckDto['shards'][number]) {
  const n = failing(s).length;
  if (busy.value) return;
  const yes = await confirm.ask({
    title: `把「${s.shardName}」的 ${n} 项改成上线值？`,
    body: '会记一条修改历史，所有进程立即生效。',
    ok: '改成上线值',
  });
  if (!yes) return;
  busy.value = true;
  try {
    data.value = await adminApi.launchCheckFix({ shardId: s.shardId, version: s.version });
    toast.push('已改成上线值');
  } catch (e) {
    // 别人刚改过这个区服的数值：重读拿新版本号，确认后再点（backlog 6B-2，以前要刷新整页）
    if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
      toast.push('这个区服的数值刚被改过，已刷新，请确认后再点', 'danger');
      await load();
    } else toast.push(errorMessage(e, '修复失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="data && data.allOk" class="dt-adm-alert is-ok" data-testid="launch-ok">
    <i class="bi bi-check-circle" aria-hidden="true"></i>
    <div><b>上线检查: 全部通过, 可以上线</b></div>
  </div>
  <div v-else-if="data" class="dt-adm-alert">
    <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
    <div class="dt-adm-grow">
      <b>上线检查: 有开关还没打开</b>
      <div class="dt-adm-scroll">
        <table class="dt-adm-table dt-adm-launch">
          <tbody>
            <template v-for="s in data.shards" :key="s.shardId">
              <tr v-for="(i, k) in failing(s)" :key="i.path">
                <td class="nowrap">
                  <b v-if="k === 0">{{ s.shardName }}</b>
                </td>
                <td class="dt-adm-mono">{{ i.path }}</td>
                <td class="nowrap">
                  现在 {{ JSON.stringify(i.current) }}, 应为 {{ JSON.stringify(i.want) }}
                </td>
                <td class="dt-adm-launch-why">{{ i.why }}</td>
                <td v-if="k === 0" class="acts" :rowspan="failing(s).length">
                  <button
                    v-if="admin.isAdmin"
                    type="button"
                    class="dt-adm-btn is-s is-sm"
                    :disabled="busy"
                    :data-testid="`launch-fix-${s.shardId}`"
                    @click="fix(s)"
                  >
                    改成上线值
                  </button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
