import { browser } from 'wxt/browser';

const HISTORY_URL = 'https://www.youtube.com/feed/history';
const BROWSE_URL = 'https://www.youtube.com/youtubei/v1/browse';
const CACHE_KEY = 'watchedIds';
const CLICKED_KEY = 'clickedIds';
const TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_CLICKED = 500;
const MAX_PAGES = 20; // safety cap on continuation depth

interface CacheEntry {
  ids: string[];
  fetchedAt: number;
}

// YouTube removed watch-history API access in 2016, so we scrape the signed-in
// history page instead. The fetch carries the user's cookies (host permission
// for youtube.com), so it sees THEIR history. Requires being logged into YouTube
// in this profile with history enabled — otherwise no IDs, feed hides nothing.
export async function fetchWatchedIds(force = false): Promise<Set<string>> {
  if (!force) {
    const cached = await readCache();
    if (cached) {
      console.log('[YouTube News] history: cache hit,', cached.size, 'ids');
      return cached;
    }
  }
  const ids = await scrapeHistory();
  if (ids.size) await writeCache(ids);
  return ids;
}

// The history list is virtual/lazy: one page load only server-renders the first
// batch (into `ytInitialData`). To read the rest we do what the page does on
// scroll — follow continuation tokens through YouTube's internal InnerTube
// `browse` endpoint, page by page, until there's no token (or MAX_PAGES).
async function scrapeHistory(): Promise<Set<string>> {
  console.log('[YouTube News] history: fetching', HISTORY_URL);
  const res = await fetch(HISTORY_URL, { credentials: 'include' });
  if (!res.ok) throw new Error(`History fetch failed: ${res.status}`);
  const html = await res.text();

  const ids = parseVideoIds(html);
  console.log('[YouTube News] history: first batch', ids.size, 'ids');

  const apiKey = matchOne(html, /"INNERTUBE_API_KEY":"([^"]+)"/);
  const clientVersion =
    matchOne(html, /"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/) ??
    matchOne(html, /"clientVersion":"([^"]+)"/);
  let token = lastMatch(html, /"continuationCommand":\{"token":"([^"]+)"/);
  console.log('[YouTube News] history: apiKey?', !!apiKey, 'clientVersion', clientVersion, 'continuation?', !!token);

  if (!apiKey || !clientVersion) {
    console.warn('[YouTube News] history: no InnerTube creds — stopping at first batch');
    return ids;
  }

  for (let page = 1; token && page <= MAX_PAGES; page++) {
    const res = await fetch(`${BROWSE_URL}?key=${apiKey}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion, hl: 'en', gl: 'US' } },
        continuation: token,
      }),
    });
    if (!res.ok) throw new Error(`Browse continuation failed: ${res.status}`);
    const before = ids.size;
    token = collect(await res.json(), ids);
    console.log(`[YouTube News] history: page ${page}, +${ids.size - before} (total ${ids.size}), more?`, !!token);
    if (ids.size === before && !token) break;
    if (page === MAX_PAGES && token) console.warn('[YouTube News] history: hit MAX_PAGES, stopping with more available');
  }
  console.log('[YouTube News] history: done,', ids.size, 'ids total');
  return ids;
}

function matchOne(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1] : null;
}

function lastMatch(s: string, re: RegExp): string | null {
  const g = new RegExp(re.source, 'g');
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = g.exec(s))) last = m[1];
  return last;
}

// Deep-walk a browse JSON response: collect every 11-char videoId and return
// the next continuation token (the last one found — the scroll continuation).
function collect(root: unknown, ids: Set<string>): string | null {
  let token: string | null = null;
  const stack: unknown[] = [root];
  while (stack.length) {
    const n = stack.pop();
    if (Array.isArray(n)) {
      for (const c of n) stack.push(c);
    } else if (n && typeof n === 'object') {
      const o = n as Record<string, any>;
      if (typeof o.videoId === 'string' && /^[\w-]{11}$/.test(o.videoId)) ids.add(o.videoId);
      if (o.continuationCommand?.token) token = o.continuationCommand.token;
      for (const k in o) stack.push(o[k]);
    }
  }
  return token;
}

// Videos clicked from the popup — marked watched instantly (the history scrape
// is cached and wouldn't see them until the next fresh fetch). Persisted so they
// stay hidden across popup opens; unioned with the scraped set on load.
export async function getClickedIds(): Promise<Set<string>> {
  const stored = await browser.storage.local.get(CLICKED_KEY);
  return new Set((stored[CLICKED_KEY] as string[] | undefined) ?? []);
}

export async function markClicked(id: string): Promise<void> {
  const stored = await browser.storage.local.get(CLICKED_KEY);
  const ids = (stored[CLICKED_KEY] as string[] | undefined) ?? [];
  if (ids.includes(id)) return;
  await browser.storage.local.set({ [CLICKED_KEY]: [...ids, id].slice(-MAX_CLICKED) });
}

function parseVideoIds(html: string): Set<string> {
  const ids = new Set<string>();
  const re = /"videoId":"([\w-]{11})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}

async function readCache(): Promise<Set<string> | null> {
  const stored = await browser.storage.local.get(CACHE_KEY);
  const entry = stored[CACHE_KEY] as CacheEntry | undefined;
  if (!entry || Date.now() - entry.fetchedAt > TTL_MS) return null;
  return new Set(entry.ids);
}

async function writeCache(ids: Set<string>): Promise<void> {
  const entry: CacheEntry = { ids: [...ids], fetchedAt: Date.now() };
  await browser.storage.local.set({ [CACHE_KEY]: entry });
}
