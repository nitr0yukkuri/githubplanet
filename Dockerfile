FROM node:18-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Renderが設定するPORT環境変数に従う
EXPOSE 3000

# シンプルな起動コマンドに変更a
CMD ["node", "server.js"]
