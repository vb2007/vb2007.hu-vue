<script setup>
import navbarDrodownLight from '../assets/navbarDropdownLight.svg'
</script>

<template>
  <nav>
    <div class="nav--box">
      <a class="nav--title" href="/index.html">vb2007.hu</a>
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
        </ul>
        <ul class="nav--list">
          <li class="nav--item nav--item-button">
            <a href="/" class="nav--link nav--button">Login</a>
          </li>
          <li class="nav--item nav--item-button">
            <a href="/" class="nav--link nav--button">Register</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<style scoped>
nav {
  position: sticky;
  top: 0;
  background-color: #00ff80;
  box-shadow: 0 2px 10px rgb(253, 251, 251);
  z-index: 1000;
  margin: 0 20px;
  /* for round bottom corners */
  border-radius: 0 0 15px 15px;
}

.nav--box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
}

.nav--title {
  font-size: 1.5rem;
  font-weight: bold;
  text-decoration: none;
  color: #333;
}

.nav--collapse {
  display: flex;
  align-items: center;
  flex-grow: 1;
  justify-content: space-between;
}

.nav--list {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0 auto;
}

.nav--item {
  /* space between the items */
  margin-right: 20px;
}

.nav--link {
  text-decoration: none;
  color: #333;
  font-size: 1rem;
}

.nav--buttons {
  display: flex;
  gap: 10px;
}

.nav--button {
  background-color: #007bff;
  color: white;
  padding: 10px 15px;
  border: none;
  border-radius: 25px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.3s;
}

.nav--button:hover {
  background-color: #0056b3;
}

.nav--toggler {
  background: transparent;
  border: none;
  cursor: pointer;
}

.nav--toggler-icon {
  width: 30px;
  height: auto;
}
</style>
