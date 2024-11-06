<template>
  <nav>
    <div class="nav--box">
      <a class="nav--title" href="">vb2007.hu</a>
      <button class="nav--toggler">
        <span class="nav--toggler-icon"></span>
      </button>
      <div class="nav--collapse">
        <ul class="nav--list">
          <li class="nav--home">
            <a href="/" class="nav--link">Home</a>
          </li>
          <li class="nav--item">
            <a href="/" class="nav--link">Shorten</a>
          </li>
          <li class="nav--item">
            <a href="/" class="nav--link">Pastebin</a>
          </li>
          <li class="nav--item">
            <a href="/" class="nav--link">Upload</a>
          </li>
          <li class="nav--item">
            <a href="/" class="nav--link">Contact</a>
          </li>
        </ul>
        <div class="nav--list-right"></div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  background-color: rgb(18, 22, 29);
  height: 60px;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  /* overflow: hidden; */
  position: fixed;
  top: 0;
  /* width: 100%; */
}

.nav--box {
  display: flex;
  justify-content: space-between;
  height: 60px;
  max-width: 1300px;
  padding-right: 50px;
  padding-left: 50px;
  z-index: 1;
}

.nav--title {
}

.nav--list {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav--list-right {
}

.nav--item {
  margin-right: 20px;
}

.nav--link {
  color: white;
  text-decoration: none;
}
</style>
