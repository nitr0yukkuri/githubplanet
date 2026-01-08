FROM node:18-slim

# 1. 必要なパッケージのインストール
# Chrome(Puppeteer)を動かすために必要なライブラリを全て記述
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    xvfb \
    # ▼▼▼ Puppeteer 必須依存ライブラリ (ここが重要) ▼▼▼
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    # ▲▲▲ 必須依存ライブラリ終了 ▲▲▲
    # 日本語フォント
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV LIBGL_ALWAYS_SOFTWARE=1
EXPOSE 3000

# Puppeteerを使う場合でも、既存構成に合わせてxvfb-run経由で起動
CMD ["xvfb-run", "-s", "-ac -screen 0 1280x1024x24", "node", "server.js"]