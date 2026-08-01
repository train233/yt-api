// yt-api/server.js - Node.js APIサーバー（PoToken連携 + yt-dlp）
const express = require('express');
const { Innertube } = require('youtubei.js');
const { exec } = require('child_process');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;

// ============================================
// 設定
// ============================================
// Renderの環境変数からPoTokenサーバーURLを取得
const POT_SERVER_URL = process.env.POT_SERVER_URL || 'https://bgutil-ytdlp-pot-provider-rs-1.onrender.com';

// CORSを許可
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
// server.js の app.use の後に追加
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
let youtube;

// ============================================
// youtubei.js 初期化
// ============================================
async function initYoutube() {
  try {
    youtube = await Innertube.create({
      generate_session_locally: true,
    });
    console.log('✅ YouTube API initialized');
  } catch (error) {
    console.error('❌ YouTube init failed:', error.message);
  }
}

// ============================================
// yt-dlpでストリームURLを取得（PoTokenサーバー連携）
// ============================================
async function getStreamWithYtDlp(videoId) {
  // yt-dlpにPoTokenサーバーのURLを渡す
  const command = `yt-dlp -g -f "best[ext=mp4]" --extractor-args "youtubepot-bgutilhttp:base_url=${POT_SERVER_URL}" https://www.youtube.com/watch?v=${videoId}`;
  
  console.log('🔍 Command:', command);
  
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ yt-dlp error:', stderr || error.message);
        reject(new Error('yt-dlp failed: ' + (stderr || error.message)));
        return;
      }
      const urls = stdout.trim().split('\n');
      resolve(urls[0] || null);
    });
  });
}

// ============================================
// API: 動画情報取得
// ============================================
app.get('/api/video', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  if (!youtube) {
    return res.status(500).json({ error: 'YouTube API not initialized' });
  }

  try {
    // 1. youtubei.jsでメタデータ取得
    const video = await youtube.getInfo(videoId);
    
    // 2. yt-dlpでストリームURL取得（PoToken付き）
    const streamUrl = await getStreamWithYtDlp(videoId);

    const result = {
      videoId: video.basic_info.id,
      title: video.basic_info.title,
      author: video.basic_info.author,
      authorId: video.basic_info.channel_id,
      thumbnail: video.basic_info.thumbnail,
      viewCount: video.basic_info.view_count,
      duration: video.basic_info.duration,
      description: video.basic_info.short_description,
      isLive: video.basic_info.is_live,
      streamUrl: streamUrl || null,
      isFrom: 'node-api',
    };
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching video:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API: 検索（yt-dlp使用）
// ============================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  try {
    // yt-dlpで検索（PoTokenサーバー連携）
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
        } catch (e) {
          // パースエラーは無視
        }
      }
      
      res.json(results);
    });
  } catch (error) {
    console.error('❌ Search error:', error.message);
    res.json([]);
  }
});

// ============================================
// API: ヘルスチェック
// ============================================
app.get('/health', (req, res) => {
  res.send('OK');
});

// ============================================
// サーバー起動
// ============================================
initYoutube().then(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 yt-api server running on port ${port}`);
    console.log(`🔗 PoToken server: ${POT_SERVER_URL}`);
  });
}).catch(err => {
  console.error('❌ Server startup failed:', err);
  process.exit(1);
});
