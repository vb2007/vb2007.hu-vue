<script setup lang="ts">
import { RouterView } from "vue-router";
import AdminGate from "@/components/features/admin/AdminGate.vue";
</script>

<template>
  <!-- Every admin page is a child route of this one, so the gate stands in front of all of them. -->
  <AdminGate>
    <RouterView />
  </AdminGate>
</template>
