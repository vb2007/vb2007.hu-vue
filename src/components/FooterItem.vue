<template>
  <footer>
    <div class="footer--box">
      <p>2023 - {{ currentYear }}</p>
    </div>
  </footer>
</template>

<script lang="ts">
import { getCurrentYear } from "../scripts/utility/dateUtil";

export default {
  data() {
    return {
      currentYear: getCurrentYear()
    };
  }
};
</script>

<style lang="css" scoped>
footer {
  background-color: rgba(219, 219, 219, 0.8);
  box-shadow: 0 2px 10px rgb(253, 251, 251);
  z-index: 1000;
  margin-left: 12%;
  margin-right: 12%;
  margin-bottom: 0;
  border-radius: 15px 15px 0 0;
  text-align: center;
}

.footer--box {
  display: flex;
  justify-content: center;
  align-content: center;
  padding-top: 10px;
}

p {
  color: var(--color-text-dark);
  font-size: 1em;
}
</style>
