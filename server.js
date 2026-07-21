// server.js - CommonJS版（requireを使う）
const express = require('express');
const { Innertube } = require('youtubei.js');

const app = express();
const port = process.env.PORT || 3000;

// CORSを許可
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

let youtube;

async function initYoutube() {
  try {
    youtube = await Innertube.create();
    console.log('✅ YouTube API initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize YouTube:', error.message);
  }
}

// 動画情報を取得するAPI
app.get('/api/video', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  if (!youtube) {
    return res.status(500).json({ error: 'YouTube API not initialized' });
  }

  try {
    const video = await youtube.getInfo(videoId);
    
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
    };
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching video:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 検索API
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
    
    const results = searchResults.map(item => ({
      videoId: item.id,
      title: item.title,
      author: item.author.name,
      thumbnail: item.thumbnails?.[0]?.url || '',
      duration: item.duration?.seconds || 0,
      viewCount: item.views,
    }));
    
    res.json(results);
  } catch (error) {
    console.error('❌ Error searching:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// サーバー起動
initYoutube().then(() => {
  app.listen(port, () => {
    console.log(`🚀 API server running at http://localhost:${port}`);
    console.log(`📹 Try: http://localhost:${port}/api/video?id=eLCF6LdkzAQ`);
  });
});