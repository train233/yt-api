const POTOKEN_SERVER = 'https://bgutil-ytdlp-pot-provider-rs-ayxn.onrender.com';

async function getPoToken() {
    const res = await fetch(`${POTOKEN_SERVER}/generate`);
    const data = await res.json();
    return data.poToken;
}

// yt-dlp実行時にPoTokenを渡す
async function getStreamUrl(videoId) {
    const poToken = await getPoToken();
    const command = `yt-dlp -g -f "best[ext=mp4]" --add-header "Authorization: PoToken ${poToken}" https://www.youtube.com/watch?v=${videoId}`;
    // ...
}
