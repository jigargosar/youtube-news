const API_KEY = import.meta.env.WXT_YOUTUBE_API_KEY as string | undefined;
const BASE = 'https://www.googleapis.com/youtube/v3';

// Tracked channels — see docs/channels.md for how these IDs were resolved.
export const CHANNELS = [
  'UCR6Dkn0axu1VCFOjbHYbGnQ', // Skeptic Scriptura
  'UCVG72F2Q5yCmLQfctNK6M2A', // Zeteo
  'UCatt7TBjfBkiJWx8khav_Gg', // Piers Morgan Uncensored
];

export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
}

export interface ChannelVideos {
  channelId: string;
  channelTitle: string;
  videos: Video[];
}

// A channel's uploads live in a playlist whose ID is the channel ID with the
// `UC` prefix swapped for `UU`. Newest-first, no search needed (1 unit/call).
function uploadsPlaylistId(channelId: string): string {
  return 'UU' + channelId.slice(2);
}

async function fetchChannel(channelId: string, perChannel: number): Promise<ChannelVideos> {
  const params = new URLSearchParams({
    part: 'snippet',
    playlistId: uploadsPlaylistId(channelId),
    maxResults: String(perChannel),
    key: API_KEY!,
  });
  const res = await fetch(`${BASE}/playlistItems?${params}`);
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const items: any[] = data.items ?? [];
  const videos: Video[] = items.map((it) => ({
    id: it.snippet.resourceId.videoId,
    title: it.snippet.title,
    thumbnail:
      it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? '',
    publishedAt: it.snippet.publishedAt,
  }));
  return {
    channelId,
    channelTitle: items[0]?.snippet?.channelTitle ?? channelId,
    videos,
  };
}

// Last N videos per channel (newest-first). We over-fetch so that after hiding
// already-watched videos there are still enough left to show 3 per channel.
export async function fetchChannelVideos(
  channelIds: string[] = CHANNELS,
  perChannel = 15,
): Promise<ChannelVideos[]> {
  if (!API_KEY) throw new Error('Missing WXT_YOUTUBE_API_KEY — check your .env');
  return Promise.all(channelIds.map((id) => fetchChannel(id, perChannel)));
}
