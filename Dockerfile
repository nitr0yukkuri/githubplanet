FROM node:18-slim

# 必要なパッケージのインストール (Chrome/Puppeteer/headless-gl用)
# ★修正: Debian 12(Bookworm)で廃止された libappindicator3-1 を削除し、
#        gl (headless-gl) や Puppeteer に不可欠なライブラリを追加・整理しました。
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    xvfb \
    wget \
    ca-certificates \
    fonts-liberation \
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
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    libgl1-mesa-dev \
    libxi-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV LIBGL_ALWAYS_SOFTWARE=1
# Renderが設定するPORT環境変数に従うため、EXPOSEは参考情報
EXPOSE 3000

# ★修正: ポート衝突防止のため -a オプションを追加
CMD ["sh", "-c", "xvfb-run -a -s '-ac -screen 0 1280x1024x24' node server.js"]