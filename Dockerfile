FROM node:24-bookworm-slim
RUN node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) throw new Error("Node.js 24.22.1+ is required");'

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Renderが設定するPORT環境変数に従う
EXPOSE 3000

# シンプルな起動コマンドに変更a
CMD ["node", "server.js"]
