<p align="right"><a href="README.md">日本語</a> | <strong>English</strong></p>

<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

<br>

# 🪐 GitHub Planet

**GitHub Planet is a web application that transforms each user's GitHub activity into a unique 3D planet.** Your development history becomes a living world floating in space.

---

## 🎨 About the Project

GitHub Planet is an interactive web experience that transforms a developer's GitHub activity into a personal 3D planet floating in space.

Public repositories, languages, contributions, stars, and contributions to external repositories are collected through GitHub OAuth and reflected in the planet's color, surface, size, rotation speed, surrounding stars, and achievements. C, CSS, C++, Go, TypeScript, JavaScript, and Rust have language-specific visuals such as steel, directional color flow, plasma, wind, atmosphere, defensive shells, and desert dust.

When a GitHub Push Webhook arrives, the application derives a shooting star's color and scale from the changed language and change size, then broadcasts it through Socket.IO to connected visitors in real time. Planets can also be explored through user visits, achievements and titles, and shareable static or animated profile cards.

## 🌟 Features

### 1. A unique planet for every developer

- **Language-based appearance:** A planet's color and visual effects reflect the programming language used most often across its owner's repositories.

### 2. AI-generated identity

- **AI naming and colors:** For languages that are not registered in the system, Google Gemini selects an appropriate image color and helps create a unique planet name.

### 3. Achievement system

- **Milestones:** Unlock achievements for development milestones such as your first contribution or 1,000 total contributions.
- **Progress:** View unlocked achievements and your completion rate on the achievements page.

### 4. Real-time shooting stars

- **Socket.IO integration:** When a repository `push` triggers a webhook, a shooting star in that language's color appears in real time for connected users.

### 5. 3D profile cards

- **Shareable cards:** Generate a dedicated card page (`card.html`) showing your planet, main language, and contribution count.

## 🌌 Add Your Planet to Your GitHub Profile

| Display option | Recommended for | GitHub Actions | Updates |
| --- | --- | --- | --- |
| Static card (default) | Getting a card displayed immediately | Not required | Snapshot when the card is requested |
| Animated GIF (optional) | Showing the planet in motion | Required | Automatically every day |

The static card is the recommended default. Replace `YOUR_USERNAME` and paste the snippet into your profile `README.md`; no repository files or GitHub Actions setup are required.

### Default (recommended, no GitHub Actions): Static card

```markdown
[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=YOUR_USERNAME&fix=true)](https://githubplanet.dev/card.html?username=YOUR_USERNAME)
```

### Optional (uses GitHub Actions): Animated GIF card

Use the following steps only when you want an animated planet:

1. Open your profile README repository (`YOUR_USERNAME/YOUR_USERNAME`).
2. Create `.github/workflows/update-planet-card.yml` with the following content.
3. Replace `YOUR_GITHUB_USERNAME` with your GitHub username.
4. Open the repository's **Actions** tab and manually run **Update Planet Card** once.
5. Confirm that `planet-card.gif` was added to the profile repository. It will then update automatically every day.

```yaml
name: Update Planet Card

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  generate:
    permissions:
      contents: read
    uses: nitr0yukkuri/githubplanet/.github/workflows/generate-profile-card-gif.yml@main
    with:
      username: YOUR_GITHUB_USERNAME

  publish:
    needs: generate
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v5
      - uses: actions/download-artifact@v4
        with:
          name: planet-card
          path: .
      - name: Validate downloaded GIF
        run: |
          file planet-card.gif | grep -q "GIF image data"
          test "$(stat --format=%s planet-card.gif)" -le 10485760
      - name: Commit updated GIF
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add planet-card.gif
          git diff --cached --quiet && exit 0
          git commit -m "Update animated planet card [skip ci]"
          git push
```

After the workflow creates the GIF, replace `YOUR_USERNAME` and paste this animated card into your profile README. The image will be broken until the first workflow run has successfully created `planet-card.gif`.

```markdown
[![GitHub Planet](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_USERNAME/main/planet-card.gif)](https://githubplanet.dev/card.html?username=YOUR_USERNAME)
```

## 🪐 Language Feature Showcase

These showcase planets are generated from fixed test data and do not depend on the database or real GitHub users. Each card uses the read-only showcase API in production.

<table>
  <tr>
    <td align="center">
      <strong>CSS — Directional Color Flow</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=css&amp;fix=true">
        <img width="400" alt="CSS showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_css.gif">
      </a>
    </td>
    <td align="center">
      <strong>C++ — Idle Plasma Globe</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=cpp&amp;fix=true">
        <img width="400" alt="C++ showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_cpp.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>Go — Atmospheric Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=go&amp;fix=true">
        <img width="400" alt="Go showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_go.gif">
      </a>
    </td>
    <td align="center">
      <strong>TypeScript — Defensive Typed Shell</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=typescript&amp;fix=true">
        <img width="400" alt="TypeScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_typescript.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>JavaScript — Reactive Golden Surface</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=javascript&amp;fix=true">
        <img width="400" alt="JavaScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_javascript.gif">
      </a>
    </td>
    <td align="center">
      <strong>Java — Java Roast</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=java&amp;fix=true">
        <img width="400" alt="Java showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_java.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
        <strong>Kotlin — Electric Spark</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=kotlin&amp;fix=true">
        <img width="400" alt="Kotlin showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_kotlin.gif">
      </a>
    </td>
    <td align="center">
      <strong>Rust — Desert Dust World</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=rust&amp;fix=true">
        <img width="400" alt="Rust showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_rust.gif">
      </a>
    </td>
  </tr>

  <tr>
    <td align="center">
      <strong>Vue — Gentle Reactive Wind</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=vue&amp;fix=true">
        <img width="400" alt="Vue showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_vue.gif">
      </a>
    </td>
    <td align="center">
      <strong>Ruby — Burning Ruby</strong><br>
      <a href="https://githubplanet.dev/card.html?showcase=ruby&amp;fix=true">
        <img width="400" alt="Ruby showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_ruby.gif">
      </a>
    </td>
  </tr>
</table>

## 🛠️ Technical Architecture

GitHub Planet is a layered modular monolith: one Node.js application divided into modules with distinct responsibilities.

| Area | Technology | Responsibility |
| :-- | :-- | :-- |
| **Frontend** | HTML / CSS / JavaScript ES Modules | User interface, interactions, and Japanese/English localization |
| **3D / Graphics** | Three.js / WebGL / GLSL / Anime.js | Planets, language shaders, stars, shooting stars, and animation |
| **Backend** | Node.js / Express | Page delivery, authentication, APIs, and application workflows |
| **Real-time** | Socket.IO / GitHub Webhook | Broadcasting Push events as shooting stars |
| **GitHub Integration** | GitHub OAuth 2.0 / REST API / GraphQL API | Authentication and retrieval of users, repositories, languages, and activity |
| **Generative AI** | Google Gemini API | Fallback color selection and planet naming for unregistered languages |
| **Database / Session** | PostgreSQL / connect-pg-simple | Persistence for planets, achievements, titles, login progress, and sessions |
| **Infrastructure** | Docker / Google Cloud Run | Local environment and production hosting |
| **Automation** | GitHub Actions / Playwright / FFmpeg | Recording 3D cards, GIF conversion, and scheduled updates |
| **Testing** | Node.js Test Runner | Regression tests for domain rules, APIs, database behavior, security, and shaders |

### Backend structure

```text
Browser
  ↓
Presentation (Express routes and HTTP input/output)
  ↓
Application (planet generation, queries, and login progress)
  ↓
Domain (achievement, title, and planet rules)
  ↓
Infrastructure (PostgreSQL, GitHub API, and Gemini API)

GitHub Webhook → Express → Socket.IO → Browser
```

- **Presentation:** Accepts HTTP requests and returns HTML or JSON.
- **Application:** Orchestrates use cases from GitHub data retrieval through aggregation and persistence.
- **Domain:** Contains GitHub Planet-specific rules such as achievement unlocking, count limits, and planet naming.
- **Infrastructure:** Implements PostgreSQL persistence and concrete external API communication.

## 🛸 Core Team

### Backend & Deployment

**[@nitr0yukkuri](https://github.com/nitr0yukkuri)**

<div align="center">
  <p><strong>@nitr0yukkuri</strong></p>
  <a href="https://githubplanet.dev/">
    <img src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif" alt="nitr0yukkuri's GitHub Planet" />
  </a>
</div>

### Frontend & Design

**[@lenagig](https://github.com/lenagig)**

<div align="center">
  <a href="https://githubplanet.dev/">
    <img src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=lenagig&fix=true" alt="lenagig's GitHub Planet" />
  </a>
</div>

## 🚀 Local Development with Docker

### 1. Prerequisites

1. **Create a GitHub OAuth App**
   - Open [GitHub Developer Settings](https://github.com/settings/developers) and select **New OAuth App**.
   - **Homepage URL:** `http://localhost:3000`
   - **Callback URL:** `http://localhost:3000/callback`
   - Keep the generated Client ID and Client Secret.

2. **Get a Gemini API key (optional)**
   - Create a key in [Google AI Studio](https://aistudio.google.com/) to enable AI-generated colors and planet names.

### 2. Configure environment variables

Create a `.env` file in the project root:

```ini
PORT=3000
NODE_ENV=development
SESSION_SECRET=dev_secret_key_123

# PostgreSQL inside Docker
DATABASE_URL=postgres://githubplanet:password@db:5432/githubplanet

# GitHub OAuth App credentials
GITHUB_CLIENT_ID_LOCAL=YOUR_CLIENT_ID
GITHUB_CLIENT_SECRET_LOCAL=YOUR_CLIENT_SECRET

# Optional Gemini API key
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Internal integration key (any development-only value)
SYSTEM_API_KEY=dev_system_key
```

### 3. Start the application

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Press `Ctrl+C` to stop the application.
