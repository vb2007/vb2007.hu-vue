/** Realistic pastes and the language each must be detected as: the detector's accuracy contract. */
export const DETECT_SAMPLES: [name: string, language: string, content: string][] = [
  [
    "a Python script with # comments",
    "python",
    `# Fetch the latest release and print its tag
import requests


def latest_tag(repo: str) -> str:
    # The API answers newest first
    response = requests.get(f"https://api.github.com/repos/{repo}/releases")
    response.raise_for_status()
    return response.json()[0]["tag_name"]


if __name__ == "__main__":
    print(latest_tag("vb2007/vb2007.hu-vue"))`
  ],
  [
    "a TypeScript module",
    "typescript",
    `import { ref } from "vue";

export interface Paste {
  _id: string;
  content: string;
}

export const usePaste = () => {
  const paste = ref<Paste | null>(null);
  const load = async (id: string): Promise<void> => {
    const response = await fetch(\`/paste/\${id}\`);
    paste.value = (await response.json()).paste as Paste;
  };
  return { paste, load };
};`
  ],
  [
    "a JavaScript snippet",
    "javascript",
    `const buttons = document.querySelectorAll("button.copy");
buttons.forEach((button) => {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.text);
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 2000);
  });
});
console.log(\`\${buttons.length} buttons ready\`);`
  ],
  [
    "a JSON document",
    "json",
    `{
  "name": "vb2007.hu-vue",
  "version": "1.1.0",
  "private": true,
  "scripts": { "dev": "vite", "build": "vite build" }
}`
  ],
  [
    "a bash script with a shebang",
    "bash",
    `#!/usr/bin/env bash
set -euo pipefail
for f in *.log; do
  gzip "$f"
done`
  ],
  [
    "a shell session without a shebang",
    "bash",
    `sudo apt update && sudo apt install -y nginx
if [ -f /etc/nginx/sites-enabled/default ]; then
  sudo rm /etc/nginx/sites-enabled/default
fi
export PATH="$HOME/.local/bin:$PATH"
echo "done: $(date)"`
  ],
  [
    "a C program",
    "c",
    `#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv) {
    char *buffer = malloc(256);
    if (buffer == NULL) {
        fprintf(stderr, "out of memory\\n");
        return 1;
    }
    snprintf(buffer, 256, "%d arguments", argc);
    printf("%s\\n", buffer);
    free(buffer);
    return 0;
}`
  ],
  [
    "a C++ program",
    "cpp",
    `#include <iostream>
#include <vector>
#include <string>

int main() {
    std::vector<std::string> names{"anna", "bela"};
    for (const auto& name : names) {
        std::cout << "Hello, " << name << std::endl;
    }
    return 0;
}`
  ],
  [
    "a C# class",
    "csharp",
    `using System;
using System.Collections.Generic;

namespace Demo
{
    public class Greeter
    {
        private readonly List<string> _names = new();

        public void Greet()
        {
            foreach (var name in _names)
            {
                Console.WriteLine($"Hello, {name}!");
            }
        }
    }
}`
  ],
  [
    "a CSS stylesheet",
    "css",
    `.sheet {
  display: grid;
  max-height: 70vh;
  border: 2px solid var(--c-edge);
  border-radius: 0.5rem;
}

.sheet__content:focus-visible {
  outline: 3px solid var(--c-line);
}

@media (min-width: 40rem) {
  .sheet { padding: 1rem; }
}`
  ],
  [
    "a git diff",
    "diff",
    `diff --git a/src/main.ts b/src/main.ts
index 3b18e51..a9c4f2d 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,4 +1,5 @@
 import { createApp } from "vue";
+import router from "./router";
 import App from "./App.vue";
-createApp(App).mount("#app");
+createApp(App).use(router).mount("#app");`
  ],
  [
    "a Dockerfile",
    "dockerfile",
    `FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080`
  ],
  [
    "a Go program",
    "go",
    `package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "ok")
	})
	if err := http.ListenAndServe(":8080", nil); err != nil {
		panic(err)
	}
}`
  ],
  [
    "an HTML page",
    "xml",
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>vb2007.hu</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`
  ],
  [
    "a TOML config",
    "ini",
    `[package]
name = "pastebin"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = "1"`
  ],
  [
    "a Java class",
    "java",
    `package hu.vb2007.demo;

import java.util.ArrayList;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        names.add("anna");
        for (String name : names) {
            System.out.println("Hello, " + name);
        }
    }
}`
  ],
  [
    "a Kotlin file",
    "kotlin",
    `package hu.vb2007.demo

data class Paste(val id: String, val content: String)

fun main() {
    val pastes = listOf(Paste("1", "hello"), Paste("2", "world"))
    pastes.filter { it.content.isNotBlank() }
        .forEach { println("\${it.id}: \${it.content}") }
}`
  ],
  [
    "a Lua script",
    "lua",
    `local function greet(name)
  if name == nil then
    return "Hello, stranger"
  end
  return "Hello, " .. name
end

for _, name in ipairs({"anna", "bela"}) do
  print(greet(name))
end`
  ],
  [
    "an nginx server block",
    "nginx",
    `server {
    listen 8080;
    server_name vb2007.hu;
    root /usr/share/nginx/html;

    location = /healthz {
        return 200 "ok";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}`
  ],
  [
    "a PHP script",
    "php",
    `<?php
declare(strict_types=1);

function greet(string $name): string
{
    return "Hello, {$name}!";
}

$names = ['anna', 'bela'];
foreach ($names as $name) {
    echo greet($name) . PHP_EOL;
}`
  ],
  [
    "a PowerShell script",
    "powershell",
    `$ErrorActionPreference = "Stop"
$logs = Get-ChildItem -Path "C:\\Logs" -Filter "*.log"
foreach ($log in $logs) {
    Compress-Archive -Path $log.FullName -DestinationPath "$($log.FullName).zip"
    Write-Host "Compressed $($log.Name)"
}`
  ],
  [
    "a Ruby class",
    "ruby",
    `require 'json'

class Paste
  attr_reader :id, :content

  def initialize(id, content)
    @id = id
    @content = content
  end

  def to_json(*args)
    { id: @id, content: @content }.to_json(*args)
  end
end

puts Paste.new(1, "hello").to_json`
  ],
  [
    "a Rust program",
    "rust",
    `use std::collections::HashMap;

fn main() {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for word in "a b a c b a".split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }
    for (word, count) in &counts {
        println!("{word}: {count}");
    }
}`
  ],
  [
    "a SQL query",
    "sql",
    `SELECT u.username, COUNT(p.id) AS pastes
FROM users u
LEFT JOIN pastes p ON p.added_by = u.id
WHERE u.created_at > '2026-01-01'
GROUP BY u.username
ORDER BY pastes DESC
LIMIT 10;`
  ],
  [
    "a Swift file",
    "swift",
    `import Foundation

struct Paste: Codable {
    let id: String
    let content: String
}

func load(from url: URL) async throws -> Paste {
    let (data, _) = try await URLSession.shared.data(from: url)
    return try JSONDecoder().decode(Paste.self, from: data)
}

guard let url = URL(string: "https://api.vb2007.hu/paste/1") else { fatalError() }`
  ],
  [
    "a YAML compose file",
    "yaml",
    `services:
  web:
    image: ghcr.io/vb2007/vb2007.hu-vue:latest
    restart: unless-stopped
    read_only: true
    ports:
      - "8080:8080"
    environment:
      - TZ=Europe/Budapest`
  ],
  [
    "a Markdown README",
    "markdown",
    `# vb2007.hu

A personal tools hub.

## Running it

- Install the dependencies with \`npm ci\`
- Start the dev server with \`npm run dev\`

See [the API](https://github.com/vb2007/vb2007.hu-api) for the backend.`
  ],
  [
    "Markdown that is mostly a code fence",
    "markdown",
    `Here's the fix:

\`\`\`python
# Retry on failure
for attempt in range(3):
    if send():
        break
\`\`\`

**Note:** it only retries three times.`
  ],
  [
    "a Markdown checklist",
    "markdown",
    `## Todo

- [x] Highlight pastes
- [ ] Render **Markdown**
- [ ] Detect the language

> Ship it before Friday.`
  ],
  [
    "YAML with # comments and lists",
    "yaml",
    `# Deploys on every push to main
name: Deploy
on:
  push:
    branches:
      - main
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # Check out first
      - uses: actions/checkout@v4
      - run: npm ci`
  ],
  [
    "a bash script with # comments and dashes",
    "bash",
    `# Back up the database
# - keeps seven days
backup_dir="/var/backups/mongo"
mkdir -p "$backup_dir"
mongodump --archive="$backup_dir/$(date +%F).gz" --gzip
find "$backup_dir" -mtime +7 -delete`
  ],
  [
    "JavaScript that calls handlers[name](event)",
    "javascript",
    `const handlers = {
  click: (event) => console.log("clicked", event.target),
  keydown: (event) => console.log(\`key \${event.key}\`)
};
for (const name of Object.keys(handlers)) {
  window.addEventListener(name, (event) => handlers[name](event));
}`
  ],
  [
    "Python with ** and __dunder__",
    "python",
    `import math


class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __abs__(self):
        return math.sqrt(self.x**2 + self.y**2)


def build(**kwargs):
    return Point(**kwargs)`
  ],
  // Short snippets, where highlight.js alone can't tell code from prose.
  ["a one-line Python print", "python", "print('hello')"],
  ["a Python loop", "python", "for i in range(10):\n    print(i)"],
  ["a two-line JavaScript snippet", "javascript", "const x = 1;\nconsole.log(x);"],
  ["a one-line SQL query", "sql", "SELECT * FROM users;"],
  ["a one-line Rust main", "rust", 'fn main() { println!("hi"); }'],
  ["a Go assignment", "go", "x := 5\nfmt.Println(x)"],
  ["a single shell command", "bash", "sudo systemctl restart nginx"],
  ["a CSS rule", "css", "body {\n  margin: 0;\n}"],
  // Prose that looks a little like code.
  [
    "a sentence with a semicolon",
    "plaintext",
    "Note: this is a test; ignore it. if you can, reply by friday"
  ],
  [
    "a sentence about code",
    "plaintext",
    "The function returns null if the user is not found, otherwise the user object."
  ],
  [
    "a letter",
    "plaintext",
    "Dear team,\nplease find the notes attached. Let me know if anything is missing.\nThanks, Anna"
  ],
  ["a list with a colon heading", "plaintext", "Shopping list:\nmilk\nbread\neggs"],
  ["key: value notes", "plaintext", "Server IP: 10.0.0.5\nUser: admin\nPort: 22"],
  ["an error message", "plaintext", "error: something failed at line 3 (exit code 1)"],
  ["a short note", "plaintext", "remember to renew the domain"],
  [
    "a paragraph of prose",
    "plaintext",
    `Hi! The meeting moved to Thursday at 3pm. Bring the printed slides, and if you can,
a laptop with the demo already running. We'll go through the questions afterwards.`
  ],
  ["a single word", "plaintext", "hello"]
];
