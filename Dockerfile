# Dockerfile
FROM node:20-alpine

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm ci

# ソースコードのコピー
COPY . .

# ポート公開
EXPOSE 3000

# サーバー起動
CMD ["npm", "start"]