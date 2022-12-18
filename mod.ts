import { parse } from 'https://deno.land/std@0.167.0/flags/mod.ts';
import { z } from 'https://deno.land/x/zod@v3.20.2/mod.ts';
import { login, trackScrobble } from './lastfm.ts';
import { loadMatchingsFromFile } from './matching.ts';

const { username, unmatched: unmatchedFile, recenttracks, _: endsongFiles } = z
  .object({
    recenttracks: z.string().optional(),
    unmatched: z.string().optional(),
    username: z.string().optional(),
    _: z.array(
      z.union([z.string(), z.number()]).transform((arg) => String(arg)),
    ),
  }).parse(parse(Deno.args, {
    string: ['recenttracks', 'username', 'unmatched'],
  }));

const { API_KEY, API_SECRET } = z.object({
  API_KEY: z.string(),
  API_SECRET: z.string(),
})
  .parse(Deno.env.toObject());

if (!unmatchedFile) {
  throw new Error();
}

const unmatched = await loadMatchingsFromFile(unmatchedFile);

const { session } = await login(API_KEY, API_SECRET);

console.log(
  await trackScrobble(
    API_KEY,
    API_SECRET,
    session.key,
    unmatched.slice(0, 1).map(({ endsong: e }) => ({
      artist: e.artist,
      track: e.name,
      timestamp: e.ts,
      album: e.album,
      duration: Math.round(e.playedMs / 1000),
    })),
  ),
);
