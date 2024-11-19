<script setup>
import navbarDrodownLight from '../assets/navbarDropdownLight.svg'
</script>

<template>
  <nav>
    <div class="nav--box">
      <a class="nav--title" href="">vb2007.hu</a>
      <button class="nav--toggler">
        <img
          :src="navbarDrodownLight"
          alt="Navbar dropdown menu toggler"
          class="nav--toggler-icon"
        />
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
          <li class="nav--item nav--item-button">
            <a href="" class="nav--link nav--button">Login</a>
          </li>
          <li class="nav--item nav--item-button">
            <a href="" class="nav--link nav--button">Register</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  background-color: rgb(18, 22, 29);
  height: 60px;
  width: 100%;
  margin-left: 20px;
  margin-right: 20px;
  display: flex;
  justify-content: center;
  align-content: center;
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
  height: 100%;
  width: 100%;
}

.nav--item-button {
  padding: 10px 20px;
}

.nav--link {
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  text-align: center;
  text-decoration: none;
}

.nav--button {
  height: 100%;
  width: 100%;
  outline: none;
  border-radius: 3px;
  background-color: green;
  border-style: solid;
  border-width: 2px;
  border-color: lightblue;
  cursor: pointer;
}

.nav--toggler {
  display: none;
  align-content: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 8px;
  background: none;
  border: none;
  cursor: pointer;
}

.nav--toggler-icon {
  width: 24px;
  height: 24px;
}

/* Tablet styles */
@media screen and (max-width: 768px) {
  .nav--collapse {
    display: none;
  }

  .nav--toggler {
    display: flex;
  }
}

/* Mobile styles */
@media screen and (max-width: 480px) {
  .nav--collapse {
    display: none;
  }

  .nav--toggler {
    display: flex;
  }
}
</style>
