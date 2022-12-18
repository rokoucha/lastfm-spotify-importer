import { parse } from 'https://deno.land/std@0.167.0/flags/mod.ts';
import { difference } from 'https://deno.land/std@0.168.0/datetime/mod.ts';
import { distance } from 'https://deno.land/x/fastest_levenshtein@1.0.10/mod.ts';
import { z } from 'https://deno.land/x/zod@v3.20.2/mod.ts';
import { loadRecentracksFromFile, Track } from './lastfm.ts';
import { Endsong, loadEndsongsFromFiles } from './spotify.ts';

const SCROBBLE_MIN_PLAYED_MS = 30_000 as const;
const MERGABLE_TIME_DIFF = 15 as const;

export const SongMatching = z.object({
  endsong: z.object({
    album: z.string(),
    artist: z.string(),
    name: z.string(),
    playedMs: z.number(),
    spotifyTrackUri: z.string().nullable(),
    ts: z.coerce.date(),
  }),
  tracks: z.array(z.object({
    album: z.string(),
    artist: z.string(),
    distance: z.number(),
    mbid: z.string(),
    name: z.string(),
    ts: z.coerce.date(),
    url: z.string(),
  })),
});

export type SongMatching = z.infer<typeof SongMatching>;

type MatchableEndsong = Endsong & {
  master_metadata_album_album_name: string;
  master_metadata_album_artist_name: string;
  master_metadata_track_name: string;
};

type MatchableTrack = Track & {
  date: {
    uts: Date;
    '#text': string;
  };
};

export function toMatchableTracks(tracks: Track[]): MatchableTrack[] {
  return tracks.filter((
    t,
  ): t is MatchableTrack => t.date != null);
}

export function toMatchableEndsongs(endsongs: Endsong[]): MatchableEndsong[] {
  return endsongs
    .filter((
      e,
    ): e is MatchableEndsong =>
      e.master_metadata_album_album_name != null &&
      e.master_metadata_album_artist_name != null &&
      e.master_metadata_track_name != null
    );
}

export function matchEndsongsAndTracks(
  endsongs: Endsong[],
  tracks: Track[],
): { matched: SongMatching[]; unmatched: SongMatching[] } {
  const es = toMatchableEndsongs(endsongs)
    .filter((e) => e.ms_played >= SCROBBLE_MIN_PLAYED_MS)
    .sort((
      a,
      b,
    ) => a.ts.getTime() - b.ts.getTime())
    .map((e) => ({
      album: e.master_metadata_album_album_name,
      artist: e.master_metadata_album_artist_name,
      name: e.master_metadata_track_name,
      playedMs: e.ms_played,
      spotifyTrackUri: e.spotify_track_uri,
      ts: new Date(e.ts.getTime() - e.ms_played),
    }));

  const tr = toMatchableTracks(tracks);

  console.warn(
    'Matching',
    es.length,
    'songs',
    'and',
    tr.length,
    'tracks',
  );

  const matched: SongMatching[] = [];
  const unmatched: SongMatching[] = [];

  for (const [i, endsong] of es.entries()) {
    if (i % 500 == 0) {
      console.warn(i, '/', es.length);
    }

    const tracks = tr
      .filter((t) =>
        Math.abs(
          difference(t.date.uts, endsong.ts, { units: ['seconds'] }).seconds ??
            Number.MAX_SAFE_INTEGER,
        ) < MERGABLE_TIME_DIFF
      )
      .map((t) => ({
        album: t.album['#text'],
        artist: t.artist['#text'],
        distance: distance(t.name.toLowerCase(), endsong.name.toLowerCase()),
        mbid: t.mbid,
        name: t.name,
        ts: t.date.uts,
        url: t.url,
      }))
      .sort((a, b) => a.distance - b.distance);

    if (tracks.length > 0) {
      matched.push({
        endsong,
        tracks: tracks.at(0)?.distance === 0 ? [tracks.at(0)!] : tracks,
      });
    } else {
      unmatched.push({
        endsong,
        tracks: [],
      });
    }
  }

  return { matched, unmatched };
}

export async function loadMatchingsFromFile(
  matchingFile: string,
): Promise<SongMatching[]> {
  const matchings: SongMatching[] = [];

  const matchingJson = await Deno.readTextFile(matchingFile);
  matchings.push(
    ...await z.array(SongMatching).parseAsync(JSON.parse(matchingJson)),
  );

  console.warn('Successfully loaded', matchings.length, 'matchings');

  return matchings;
}

if (import.meta.main) {
  const { recenttracks, _: endsongFiles } = z.object({
    recenttracks: z.string(),
    _: z.array(
      z.union([z.string(), z.number()]).transform((arg) => String(arg)),
    ),
  }).parse(parse(Deno.args, { string: ['recenttracks'] }));

  const endsongs = await loadEndsongsFromFiles(endsongFiles);
  const tracks = await loadRecentracksFromFile(recenttracks);

  const tracksJson = await Deno.readTextFile(recenttracks);
  tracks.push(...await z.array(Track).parseAsync(JSON.parse(tracksJson)));

  console.warn('Successfully loaded', tracks.length, 'songs');

  const { matched, unmatched } = matchEndsongsAndTracks(endsongs, tracks);

  console.warn(
    matched.length,
    unmatched.length,
  );

  await Deno.writeTextFile('matched.json', JSON.stringify(matched));
  await Deno.writeTextFile('unmatched.json', JSON.stringify(unmatched));
}
