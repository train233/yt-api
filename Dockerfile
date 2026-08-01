# Dockerfile
FROM node:20-slim

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlpをインストール（キャッシュ無効化）
RUN pip3 install --no-cache-dir yt-dlp

# アプリのソースをコピー
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# ポートを公開
EXPOSE 10000

# 起動コマンド
CMD ["node", "server.js"]
