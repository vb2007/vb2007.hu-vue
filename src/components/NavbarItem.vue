<template>
  <nav>
    <a href="">vb2007.hu</a>
    <button class="navbar-toggler">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse">
      <ul class="nav-list">
        <li class="nav-item">
          <a href="/" class="nav-link">Home</a>
        </li>
        <li class="nav-item">
          <a href="/" class="nav-link">Shorten</a>
        </li>
        <li class="nav-item">
          <a href="/" class="nav-link">Pastebin</a>
        </li>
        <li class="nav-item">
          <a href="/" class="nav-link">Upload</a>
        </li>
        <li class="nav-item">
          <a href="/" class="nav-link">Contact</a>
        </li>
      </ul>
      <div class="nav-list-right"></div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  display: flex;
  overflow: hidden;
  position: fixed;
  top: 0;
  width: 100%;
  background-color: rgb(18, 22, 29);
}

.nav-list {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-list-right {
}

.nav-item {
  margin-right: 20px;
}

.nav-link {
  color: white;
  text-decoration: none;
}
</style>
