FROM node:18-slim

# 1. 必要なパッケージのインストール (xvfb, libx11-dev を追加)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    xvfb \
    libx11-dev \
    libgl1 \
    libgl1-mesa-dri \
    libglapi-mesa \
    libgl1-mesa-dev \
    libxi-dev \
    libglew-dev \
    libglu1-mesa-dev \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# 2. ソフトウェアレンダリングを強制する環境変数
ENV LIBGL_ALWAYS_SOFTWARE=1

EXPOSE 3000

# 3. 仮想ディスプレイ(Xvfb)経由でサーバーを起動
CMD ["xvfb-run", "-s", "-ac -screen 0 1280x1024x24", "node", "server.js"]