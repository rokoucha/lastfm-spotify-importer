import { z } from 'https://deno.land/x/zod@v3.20.2/mod.ts';

export const ReasonStart = {
  '': '',
  'appload': 'appload',
  'backbtn': 'backbtn',
  'clickrow': 'clickrow',
  'fwdbtn': 'fwdbtn',
  'playbtn': 'playbtn',
  'remote': 'remote',
  'trackdone': 'trackdone',
  'trackerror': 'trackerror',
} as const;
export type ReasonStart = typeof ReasonStart[keyof typeof ReasonStart];

export const ReasonEnd = {
  '': '',
  'backbtn': 'backbtn',
  'endplay': 'endplay',
  'fwdbtn': 'fwdbtn',
  'logout': 'logout',
  'remote': 'remote',
  'trackdone': 'trackdone',
  'trackerror': 'trackerror',
  'unexpected-exit-while-paused': 'unexpected-exit-while-paused',
  'unexpected-exit': 'unexpected-exit',
  'unknown': 'unknown',
} as const;
export type ReasonEnd = typeof ReasonEnd[keyof typeof ReasonEnd];

export const Endsong = z.object({
  ts: z.coerce.date(),
  username: z.string(),
  platform: z.string(),
  'ms_played': z.number(),
  'conn_country': z.string(),
  'ip_addr_decrypted': z.string(),
  'user_agent_decrypted': z.nullable(z.string()),
  'master_metadata_track_name': z.nullable(z.string()),
  'master_metadata_album_artist_name': z.nullable(z.string()),
  'master_metadata_album_album_name': z.nullable(z.string()),
  'spotify_track_uri': z.nullable(z.string()),
  'episode_name': z.nullable(z.string()),
  'episode_show_name': z.nullable(z.string()),
  'spotify_episode_uri': z.nullable(z.string()),
  'reason_start': z.nativeEnum(ReasonStart),
  'reason_end': z.nativeEnum(ReasonEnd),
  'shuffle': z.boolean(),
  'skipped': z.nullable(z.boolean()),
  'offline': z.boolean(),
  'offline_timestamp': z.coerce.date(),
  'incognito_mode': z.boolean(),
});
export type Endsong = z.infer<typeof Endsong>;

export async function loadEndsongsFromFiles(
  endsongFiles: string[],
): Promise<Endsong[]> {
  const endsongs: Endsong[] = [];

  console.warn('Load', endsongFiles.length, 'files...');
  for (const [i, endsongFile] of endsongFiles.entries()) {
    console.warn('Processing file', i + 1, '/', endsongFiles.length);
    const endsongText = await Deno.readTextFile(endsongFile);

    const endsongJson = JSON.parse(endsongText);

    const endsong = await z.array(Endsong).parseAsync(endsongJson);

    console.warn('Loaded', endsong.length, 'songs');
    endsongs.push(...endsong);
  }

  console.warn('Successfully loaded', endsongs.length, 'songs');

  return endsongs;
}
