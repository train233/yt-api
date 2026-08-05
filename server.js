// server.js - YouTube APIサーバー（yt-dlp + youtubei.js）
const express = require('express');
const { Innertube } = require('youtubei.js');
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

let youtube;

async function initYoutube() {
  try {
    youtube = await Innertube.create({
      generate_session_locally: true,
    });
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
    
    const command = `yt-dlp -g -f "best[ext=mp4]" https://www.youtube.com/watch?v=${videoId}`;
    const streamUrl = await new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          const urls = stdout.trim().split('\n');
          resolve(urls[0] || '');
        }
      });
    });

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
      streamUrl: streamUrl,
      isFrom: 'node-api',
    };
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching video:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ✅ 検索API（yt-dlp版）
// ============================================
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  const command = `yt-dlp -j --flat-playlist "ytsearch20:${query}"`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ yt-dlp search error:', stderr || error.message);
      return res.json([]);
    }
    
    const lines = stdout.trim().split('\n').filter(function(line) { return line.trim(); });
    const results = [];
    
    for (var i = 0; i < lines.length; i++) {
      try {
        var data = JSON.parse(lines[i]);
        if (data.id) {
          results.push({
            videoId: data.id || '',
            title: data.title || 'タイトルなし',
            author: data.uploader || '不明',
            thumbnail: data.thumbnail || `https://img.youtube.com/vi/${data.id}/hqdefault.jpg`,
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
});

// ストリームURL取得API（yt-dlp）
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id' });
  }

  const command = `yt-dlp -g -f "best[ext=mp4]" https://www.youtube.com/watch?v=${videoId}`;
  
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ yt-dlp error:', stderr || error.message);
      return res.status(500).json({ error: 'Failed to get stream URL' });
    }
    
    const urls = stdout.trim().split('\n');
    const videoUrl = urls[0];
    
    if (!videoUrl) {
      return res.status(500).json({ error: 'No stream URL found' });
    }
    
    res.json({ 
      url: videoUrl,
      format: 'mp4',
      isFrom: 'yt-dlp'
    });
  });
});

// サーバー起動
initYoutube().then(() => {
  app.listen(port, () => {
    console.log(`🚀 API server running at http://localhost:${port}`);
    console.log(`📹 Try: http://localhost:${port}/api/video?id=eLCF6LdkzAQ`);
    console.log(`🎬 Stream: http://localhost:${port}/api/stream?id=eLCF6LdkzAQ`);
  });
});
