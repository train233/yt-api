// yt-api/server.js - youtubei.js を完全に除去した版
const express = require('express');
const { generate } = require('youtube-po-token-generator');
const { exec } = require('child_process');

const app = express();
const port = process.env.PORT || 3000;

// CORSを許可
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ============================================
// PoToken生成（キャッシュ付き）
// ============================================
let cachedPoToken = null;
let cacheTime = 0;
const CACHE_DURATION = 3600000; // 1時間

async function getPoToken() {
  const now = Date.now();
  if (cachedPoToken && (now - cacheTime) < CACHE_DURATION) {
    console.log('✅ Using cached PoToken');
    return cachedPoToken;
  }

  try {
    console.log('🔄 Generating new PoToken...');
    const result = await generate();
    cachedPoToken = result.poToken;
    cacheTime = now;
    console.log('✅ PoToken generated');
    return cachedPoToken;
  } catch (error) {
    console.error('❌ PoToken generation failed:', error.message);
    return null;
  }
}

// ============================================
// yt-dlpで動画情報を取得（メタデータ + ストリームURL）
// ============================================
async function getVideoWithYtDlp(videoId) {
  const poToken = await getPoToken();
  if (!poToken) {
    console.error('❌ No PoToken available');
    return null;
  }

  // -j でJSON出力、-f でストリームURLも取得
  const command = `yt-dlp -j --extractor-args "youtube:po_token=web.player+${poToken}" https://www.youtube.com/watch?v=${videoId}`;

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ yt-dlp error:', stderr || error.message);
        reject(new Error('yt-dlp failed: ' + (stderr || error.message)));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        resolve({
          videoId: data.id || videoId,
          title: data.title || 'タイトルなし',
          author: data.uploader || '不明',
          authorId: data.channel_id || '',
          thumbnail: data.thumbnail || '',
          viewCount: data.view_count || 0,
          duration: data.duration || 0,
          description: data.description || '',
          // ストリームURL（best[ext=mp4]）
          streamUrl: data.url || null,
          isLive: data.is_live || false,
        });
      } catch (parseError) {
        console.error('❌ JSON parse error:', parseError.message);
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
  });
}

// ============================================
// ルート
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'yt-api is running (yt-dlp only)',
    endpoints: {
      video: '/api/video?id=VIDEO_ID',
      search: '/api/search?q=QUERY',
      health: '/health'
    }
  });
});

// ============================================
// API: 動画情報取得（yt-dlpのみ）
// ============================================
app.get('/api/video', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  try {
    const result = await getVideoWithYtDlp(videoId);
    if (!result) {
      return res.status(500).json({ error: 'Failed to fetch video' });
    }
    res.json({
      ...result,
      isFrom: 'node-api-ytdlp',
    });
  } catch (error) {
    console.error('❌ Error fetching video:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API: 検索（yt-dlp）
// ============================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  try {
    const poToken = await getPoToken();
    const command = `yt-dlp -j --flat-playlist --extractor-args "youtube:po_token=web.player+${poToken}" "ytsearch20:${query}"`;

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
        } catch (e) { /* パースエラーは無視 */ }
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
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 yt-api running on port ${port}`);
});
