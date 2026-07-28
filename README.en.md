<p align="right"><a href="README.md">日本語</a> | <strong>English</strong></p>

<img src="front/img/GitHubPlanet_logo.png" width="80%" alt="GitHub Planet Logo">

<br>

# 🪐 GitHub Planet

**GitHub Planet is a web application that transforms each user's GitHub activity into a unique 3D planet.** Your development history becomes a living world floating in space.

---

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

Visit GitHub Planet and replace `YOUR_USERNAME` in the following snippet:

### Display a static card immediately

```markdown
[![GitHub Planet](https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?username=YOUR_USERNAME&fix=true)](https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?username=YOUR_USERNAME)
```

### Automatically update an animated GIF card

Add `.github/workflows/update-planet-card.yml` to your profile README repository. The workflow generates and publishes an updated GIF every day.

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

After the workflow creates the GIF, replace `YOUR_USERNAME` and paste this animated card into your profile README:

```markdown
[![GitHub Planet](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_USERNAME/main/planet-card.gif)](https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?username=YOUR_USERNAME)
```

## 🪐 Language Feature Showcase

These showcase planets are generated from fixed test data and do not depend on the database or real GitHub users. Each card uses the read-only showcase API in production.

<table>
  <tr>
    <td align="center">
      <strong>CSS — Directional Color Flow</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=css&amp;fix=true">
        <img width="400" alt="CSS showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_css.gif">
      </a>
    </td>
    <td align="center">
      <strong>C++ — Idle Plasma Globe</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=cpp&amp;fix=true">
        <img width="400" alt="C++ showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_cpp.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>Go — Atmospheric Wind</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=go&amp;fix=true">
        <img width="400" alt="Go showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_go.gif">
      </a>
    </td>
    <td align="center">
      <strong>TypeScript — Defensive Typed Shell</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=typescript&amp;fix=true">
        <img width="400" alt="TypeScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_typescript.gif">
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <strong>JavaScript — Reactive Golden Surface</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=javascript&amp;fix=true">
        <img width="400" alt="JavaScript showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_javascript.gif">
      </a>
    </td>
    <td align="center">
      <strong>Rust — Desert Dust World</strong><br>
      <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?showcase=rust&amp;fix=true">
        <img width="400" alt="Rust showcase planet" src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/showcase_rust.gif">
      </a>
    </td>
  </tr>
</table>

## 🛠️ Tech Stack

| Category | Technology | Role |
| :-- | :-- | :-- |
| **Frontend** | Three.js / Anime.js | Real-time 3D rendering and animation for planets, stars, and visual effects |
| **Backend** | Node.js / Express | API endpoints and application logic |
| **AI** | Google Gemini API | Language-based color selection and unique planet naming |
| **Real-time** | Socket.IO | Real-time shooting-star events triggered by webhooks |
| **Database** | PostgreSQL | Persistence for planets, users, and achievements |
| **Authentication** | GitHub OAuth 2.0 | Authentication and GitHub activity retrieval |
| **Deployment** | Google Cloud Run | Application hosting |

## 🛸 Core Team

### Backend & Deployment

**[@nitr0yukkuri](https://github.com/nitr0yukkuri)**

<div align="center">
  <p><strong>@nitr0yukkuri</strong></p>
  <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/">
    <img src="https://raw.githubusercontent.com/nitr0yukkuri/githubplanet/card-assets/profile_card.gif" alt="nitr0yukkuri's GitHub Planet" />
  </a>
</div>

### Frontend & Design

**[@lenagig](https://github.com/lenagig)**

<div align="center">
  <a href="https://githubplanet-git-543426763451.asia-northeast2.run.app/">
    <img src="https://image.thum.io/get/width/800/crop/400/noanimate/wait/8/https://githubplanet-git-543426763451.asia-northeast2.run.app/card.html?username=lenagig&fix=true" alt="lenagig's GitHub Planet" />
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
