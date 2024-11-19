<template>
  <footer>
    <p>VB2007 | 2023 - {{ currentYear }}</p>
  </footer>
</template>

<script lang="ts">
import { getCurrentYear } from '../scripts/utility/dateUtil'

export default {
  data() {
    return {
      currentYear: getCurrentYear()
    }
  }
}
</script>

<style scoped>
footer {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 60px;
  background-color: rgb(131, 111, 111);
}
</style>
