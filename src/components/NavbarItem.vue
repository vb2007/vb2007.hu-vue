<template>
  <nav>
    <div class="nav--box">
      <a class="nav--title" href="">vb2007.hu</a>
      <button class="nav--toggler">
        <span class="nav--toggler-icon"></span>
      </button>
      <div class="nav--collapse">
        <ul class="nav--list">
          <li id="nav--home" class="nav--item">
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
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  text-decoration: none;
  font-size: 1.5rem;
}

.nav--list {
  display: flex;
  align-items: center;
  list-style: none;
  height: 100%;
}

.nav--item {
  display: flex;
  align-items: center;
  margin-right: 20px;
}

.nav--link {
  color: white;
  text-align: center;
  text-decoration: none;
}
</style>
