<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="dt-app">
    <header class="dt-header d-flex align-items-center px-2">
      <i class="bi bi-shop me-1"></i>
      <span class="fw-bold">美味小镇</span>
    </header>
    <main class="dt-main">
      <RouterView />
    </main>
  </div>
</template>
