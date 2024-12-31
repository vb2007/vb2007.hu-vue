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
.login--container {
  display: flex;
  flex-direction: column;
  height: auto;
  gap: 20px;
  align-items: center;
}

form {
  width: 25%;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

input {
  padding: 5px;
  border-radius: 5px;
  border: 1px solid #ccc;
}

label {
  font-weight: bold;
}
</style>
