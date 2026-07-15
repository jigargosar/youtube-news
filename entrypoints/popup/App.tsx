import { useEffect, useState } from 'react';
import { fetchChannelVideos, type ChannelVideos, type Video } from './youtube';
import { fetchWatchedIds, getClickedIds, markClicked } from './watched';

const PER_CHANNEL = 3;

// Drop watched videos, then keep the first PER_CHANNEL unwatched per channel.
function hideWatched(channels: ChannelVideos[], watched: Set<string>): ChannelVideos[] {
  return channels.map((ch) => ({
    ...ch,
    videos: ch.videos.filter((v) => !watched.has(v.id)).slice(0, PER_CHANNEL),
  }));
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ];
  for (const [size, label] of units) {
    if (secs >= size) return `${Math.floor(secs / size)}${label} ago`;
  }
  return 'just now';
}

function VideoRow({ v, onWatch }: { v: Video; onWatch: (id: string) => void }) {
  return (
    <li>
      <a
        href={`https://www.youtube.com/watch?v=${v.id}`}
        target="_blank"
        rel="noreferrer"
        onClick={() => onWatch(v.id)}
        className="flex gap-2.5 px-3 py-2 hover:bg-neutral-900"
      >
        <img
          src={v.thumbnail}
          alt=""
          loading="lazy"
          className="h-[68px] w-[120px] flex-shrink-0 rounded-lg bg-neutral-800 object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 text-[13px] font-medium leading-tight">{v.title}</span>
          <span className="text-xs text-neutral-400">{timeAgo(v.publishedAt)}</span>
        </div>
      </a>
    </li>
  );
}

function App() {
  const [raw, setRaw] = useState<ChannelVideos[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  function load(force = false) {
    setStatus('loading');
    setError('');
    // Fast path: channels + locally-clicked IDs render immediately.
    Promise.all([fetchChannelVideos(), getClickedIds()])
      .then(([channels, clicked]) => {
        console.log(
          '[YouTube News] channels',
          channels.map((c) => `${c.channelTitle}:${c.videos.length}`),
          '| clicked', clicked.size,
        );
        setRaw(channels);
        setWatched(clicked);
        setStatus('ready');
        // Slow path: scrape YouTube history, then refine the hidden set.
        return fetchWatchedIds(force).then((scraped) => {
          console.log('[YouTube News] watched set:', clicked.size, 'clicked +', scraped.size, 'scraped');
          setWatched(new Set([...clicked, ...scraped]));
        });
      })
      .catch((e) => {
        console.error('[YouTube News]', e);
        setError(e.message);
        setStatus('error');
      });
  }

  useEffect(() => {
    load();
  }, []);

  // Clicking a video = watching it: hide it now, and remember it across opens.
  function onWatch(id: string) {
    markClicked(id);
    setWatched((prev) => new Set(prev).add(id));
  }

  const channels = hideWatched(raw, watched);

  return (
    <div className="w-[380px] max-h-[560px] overflow-y-auto bg-neutral-950 text-neutral-100 font-sans">
      <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-2.5 bg-neutral-950 border-b border-neutral-800">
        <h1 className="text-[15px] font-semibold">YouTube News</h1>
        <button
          onClick={() => load(true)}
          disabled={status === 'loading'}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-sm hover:bg-neutral-700 disabled:opacity-50"
        >
          {status === 'loading' ? '…' : '↻'}
        </button>
      </header>

      {status === 'loading' && (
        <p className="px-4 py-5 text-[13px] text-neutral-400">Loading…</p>
      )}
      {status === 'error' && (
        <p className="px-4 py-5 text-[13px] text-red-400 whitespace-pre-wrap break-words">
          {error}
        </p>
      )}

      {status === 'ready' &&
        channels.map((ch) => (
          <section key={ch.channelId}>
            <h2 className="sticky top-[45px] bg-neutral-950 px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {ch.channelTitle}
            </h2>
            <ul>
              {ch.videos.map((v) => (
                <VideoRow key={v.id} v={v} onWatch={onWatch} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

export default App;
