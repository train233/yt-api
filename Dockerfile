FROM node:20-slim

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlpをバイナリとしてインストール
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# アプリのソースをコピー
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 10000
CMD ["node", "server.js"]
