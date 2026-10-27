<p align="right"><a href="README.md">日本語</a> | <strong>English</strong></p>

<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

<br>

# 🪐 GitHub Planet

**GitHub Planet is a web application that transforms each user's GitHub activity into a unique 3D planet.** Your development history becomes a living world floating in space.

---

## 🎬 Try the one-minute demo first

Use the login-free demo to experience a planet generated from deterministic showcase data.

[Open the login-free demo](https://githubplanet.dev/demo?showcase=typescript)

1. Open the demo
2. Explore the planet's color, surface, scale, and rotation
3. Check achievements and language-specific visuals
4. Switch between showcases such as css, cpp, go, javascript, and rust

The demo does not depend on a real GitHub user or the production database. For reviews, exhibitions, and demo videos, start here to see the core visual experience.

## 🎨 About the Project

GitHub Planet is an interactive web experience that transforms a developer's GitHub activity into a personal 3D planet floating in space.

Public repositories, languages, contributions, stars, and contributions to external repositories are collected through GitHub OAuth and reflected in the planet's color, surface, size, rotation speed, surrounding stars, and achievements. C, CSS, C++, Elm, Go, Perl, TypeScript, JavaScript, and Rust have language-specific visuals such as steel, directional color flow, plasma, wind-shaped vegetation, atmosphere, ocean currents, defensive shells, and desert dust.

When a GitHub Push Webhook arrives, the application derives a shooting star's color and scale from the changed language and change size, then broadcasts it through Socket.IO to connected visitors in real time. Planets can also be explored through user visits, achievements and titles, and shareable static or animated profile cards.

## 🏆 Awards

- **CSS Winner — Star** (Score 7.5) — https://www.csswinner.com/details/github-planet/19334
- **Demo Stage — Grand Prize** （最優秀賞）
- **Geek CAMP Vol.14 (技育CAMP) — Excellence Award** （優秀賞）
- **Geek Haku Vol.6 (技育博) — Corporate Award, WingArc1st** （企業賞）
- **Heroes League 2025 — Finalist** （決勝進出）

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

These showcase planets are generated from fixed test data and do not depend on the database or real GitHub users.

See the [Card Gallery](docs/cards/README.en.md) for the full card list. The Japanese version is the [カードギャラリー](docs/cards/README.md).

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

The official profile card refreshes the owner's planet data before its daily recording. Create an `official-card` environment in [Actions Environments](https://github.com/nitr0yukkuri/githubplanet/settings/environments), restrict its deployment branches to `main`, and add `CARD_REFRESH_TOKEN` as an environment secret there. Do not store this token as a repository secret. Use a fine-grained personal access token owned by the profile owner, with only the `Starring: Read` user permission. Do not grant repository permissions or other account permissions. Do not use a classic PAT or the `repo` or `public_repo` scopes. The card uses public repository data only and excludes private or internal contribution counts. The workflow sends the token over HTTPS and does not include it in logs or generated assets. If the secret is missing or the refresh fails, the workflow stops without publishing a GIF made from stale data. The scheduled run is set for 00:00 UTC.

### Frontend & Design

**[@lenagig](https://github.com/lenagig)**

<div align="center">
  <a href="https://githubplanet.dev/">
    <img src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet.dev/card.html?username=lenagig&fix=true" alt="lenagig's GitHub Planet" />
  </a>
</div>

## 📣 Featured Posts

- [Demo Stage Summer — Grand Prize announcement](https://x.com/lena_gig/status/2083880465019338867) — @lena_gig, Aug 2026
- [CSS Winner — STAR](https://x.com/lena_gig/status/2088272346117455987) — @lena_gig, Aug 2026
- [Planet 技育展 — qualifier announcement](https://x.com/lena_gig/status/2111454798038159431) — @lena_gig, Oct 2026

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

Docker Compose runs the `migrate` service before starting the application. When running Node.js directly or deploying to production, apply pending database migrations before starting the new application version:

```bash
npm run migrate
npm start
```

Open [http://localhost:3000](http://localhost:3000). Press `Ctrl+C` to stop the application.
