<script lang="ts" setup></script>

<template>
  <div class="login--container">
    <h1>Login</h1>
    <form action="">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" />
      <label for="password">Password</label>
      <input type="password" id="password" name="password" />
      <button type="submit">Login</button>
    </form>
  </div>
</template>

<style lang="css" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
