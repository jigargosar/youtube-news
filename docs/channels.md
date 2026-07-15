# Channels & how the feed resolves

## Tracked channels
MVP scope: these 3 channels, last 3 videos each, no sort/filter.
The code list lives in `entrypoints/popup/youtube.ts` (`CHANNELS`); keep this table in sync.

| Channel | Channel ID (`UC…`) | Uploads playlist (`UU…`) |
|---|---|---|
| Skeptic Scriptura | `UCR6Dkn0axu1VCFOjbHYbGnQ` | `UUR6Dkn0axu1VCFOjbHYbGnQ` |
| Zeteo | `UCVG72F2Q5yCmLQfctNK6M2A` | `UUVG72F2Q5yCmLQfctNK6M2A` |
| Piers Morgan Uncensored | `UCatt7TBjfBkiJWx8khav_Gg` | `UUatt7TBjfBkiJWx8khav_Gg` |

## The resolution chain (video URL → recent videos)
1. Video URL `…/watch?v=VIDEO_ID` → take `VIDEO_ID`.
2. `videos.list?part=snippet&id=VIDEO_ID` → `snippet.channelId` (the `UC…` ID) + `channelTitle`. *(1 unit)*
3. Turn channel ID into its **uploads playlist**: swap prefix `UC…` → `UU…`. No API call — every channel's uploads live there, newest-first.
4. `playlistItems.list?part=snippet&playlistId=UU…&maxResults=3` → each item gives `snippet.resourceId.videoId`, `title`, `publishedAt`, `thumbnails`, `channelTitle`. *(1 unit / 50)*

## Quota
Default 10,000 units/day (resets midnight PT). This feed ≈ **1 unit per channel per load**.
Avoid `search.list` (100 units). Playlist *creation* later ≈ 2,550 units/build (OAuth-gated).
