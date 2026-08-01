// yt-api/server.js - PoTokenサーバー連携版（Docker版）
const express = require('express');
const { exec } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;
const POT_SERVER_URL = process.env.POT_SERVER_URL || 'http://localhost:4416';

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ============================================
// ルート
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'yt-api is running',
    endpoints: {
      video: '/api/video?id=VIDEO_ID',
      search: '/api/search?q=QUERY',
      health: '/health'
    }
  });
});

// ============================================
// API: 動画情報取得（PoTokenサーバー連携）
// ============================================
app.get('/api/video', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  try {
    // yt-dlpにPoTokenサーバーを指定
    const command = `yt-dlp -j --extractor-args "youtubepot-bgutilhttp:base_url=${POT_SERVER_URL}" https://www.youtube.com/watch?v=${videoId}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ yt-dlp error:', stderr || error.message);
        return res.status(500).json({ error: 'yt-dlp failed' });
      }

      try {
        const data = JSON.parse(stdout);
        res.json({
          videoId: data.id || videoId,
          title: data.title || 'タイトルなし',
          author: data.uploader || '不明',
          authorId: data.channel_id || '',
          thumbnail: data.thumbnail || '',
          viewCount: data.view_count || 0,
          duration: data.duration || 0,
          description: data.description || '',
          streamUrl: data.url || null,
          isLive: data.is_live || false,
          isFrom: 'node-api-ytdlp',
        });
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError.message);
        res.status(500).json({ error: 'Failed to parse yt-dlp output' });
      }
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API: 検索
// ============================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  try {
    const command = `yt-dlp -j --flat-playlist --extractor-args "youtubepot-bgutilhttp:base_url=${POT_SERVER_URL}" "ytsearch20:${query}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ yt-dlp search error:', stderr || error.message);
        return res.json([]);
      }

      const lines = stdout.trim().split('\n').filter(line => line.trim());
      const results = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.id) {
            results.push({
              videoId: data.id || '',
              title: data.title || 'タイトルなし',
              author: data.uploader || '不明',
              thumbnail: data.thumbnail || '',
              duration: data.duration || 0,
              viewCount: data.view_count || 0,
            });
          }
        } catch (e) { /* 無視 */ }
      }

      res.json(results);
    });
  } catch (error) {
    console.error('❌ Search error:', error.message);
    res.json([]);
  }
});

// ============================================
// ヘルスチェック
// ============================================
app.get('/health', (req, res) => {
  res.send('OK');
});

// ============================================
// サーバー起動
// ============================================
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 yt-api running on port ${port}`);
  console.log(`🔗 PoToken server: ${POT_SERVER_URL}`);
});

server.timeout = 120000;
