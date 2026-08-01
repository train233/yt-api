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
const POTOKEN_SERVER = process.env.POTOKEN_SERVER || 'https://bgutil-ytdlp-pot-provider-rs-ayxn.onrender.com';

// CORSを許可
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

let youtube;
let cachedPoToken = null;
let poTokenExpiry = 0;

// ============================================
// PoTokenを取得（キャッシュ付き）
// ============================================
async function getPoToken() {
  const now = Date.now();
  if (cachedPoToken && now < poTokenExpiry) {
    return cachedPoToken;
  }

  try {
    // Rust製PoTokenサーバーから取得
    const res = await fetch(`${POTOKEN_SERVER}/generate`, {
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    if (data.poToken) {
      cachedPoToken = data.poToken;
      poTokenExpiry = now + 3600000; // 1時間キャッシュ
      console.log('✅ PoToken refreshed');
      return cachedPoToken;
    }
    throw new Error('No PoToken in response');
  } catch (error) {
    console.error('❌ PoToken fetch failed:', error.message);
    // 古いキャッシュがあれば返す（期限切れでも）
    if (cachedPoToken) return cachedPoToken;
    return null;
  }
}

// ============================================
// yt-dlpでストリームURLを取得（PoToken付き）
// ============================================
async function getStreamWithYtDlp(videoId) {
  const poToken = await getPoToken();
  
  // PoTokenをヘッダーとして渡す
  const command = `yt-dlp -g -f "best[ext=mp4]" --add-header "Authorization: PoToken ${poToken}" https://www.youtube.com/watch?v=${videoId}`;
  
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
// youtubei.jsで動画情報を取得
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
// API: 検索
// ============================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  if (!youtube) {
    return res.status(500).json({ error: 'YouTube API not initialized' });
  }

  try {
    const searchResults = await youtube.search(query, { type: 'video' });
    
    let items = [];
    if (Array.isArray(searchResults)) {
      items = searchResults;
    } else if (searchResults?.items && Array.isArray(searchResults.items)) {
      items = searchResults.items;
    } else {
      items = Object.values(searchResults).filter(item => item && typeof item === 'object' && item.id);
    }

    const results = items.map(item => ({
      videoId: item.id || '',
      title: item.title || 'タイトルなし',
      author: item.author?.name || item.author || '不明',
      thumbnail: item.thumbnails?.[0]?.url || '',
      duration: item.duration?.seconds || 0,
      viewCount: item.views || 0,
    }));

    res.json(results);
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
    console.log(`🔗 PoToken server: ${POTOKEN_SERVER}`);
  });
}).catch(err => {
  console.error('❌ Server startup failed:', err);
  process.exit(1);
});
