import { parse } from 'https://deno.land/std@0.167.0/flags/mod.ts';
import { readLines } from 'https://deno.land/std@0.167.0/io/mod.ts';
import { createHash } from 'https://deno.land/std@0.167.0/node/crypto.ts';
import { z } from 'https://deno.land/x/zod@v3.20.2/mod.ts';

export const ImageSize = {
  small: 'small',
  medium: 'medium',
  large: 'large',
  extralarge: 'extralarge',
} as const;
export type ImageSize = typeof ImageSize[keyof typeof ImageSize];

export const Track = z.object({
  artist: z.object({
    mbid: z.string(),
    '#text': z.string(),
  }),
  streamable: z.coerce.boolean(),
  image: z.array(z.object({
    size: z.nativeEnum(ImageSize),
    '#text': z.string(),
  })),
  mbid: z.string(),
  album: z.object({
    mbid: z.string(),
    '#text': z.string(),
  }),
  name: z.string(),
  '@attr': z.optional(z.object({
    nowplaying: z.union([
      z.boolean(),
      z.string().transform((arg) => arg === 'true'),
    ]),
  })),
  url: z.string(),
  date: z.optional(z.object({
    uts: z.union([
      z.coerce.date(),
      z.coerce.number().transform((arg) => new Date(arg * 1000)),
    ]),
    '#text': z.string(),
  })),
});
export type Track = z.infer<typeof Track>;

export const LastfmError = z.object({
  message: z.string(),
  error: z.number(),
});
export type LastfmError = z.infer<typeof LastfmError>;

export const Session = z.object({
  'session': z.object({
    name: z.string(),
    key: z.string(),
    subscriber: z.number(),
  }),
});
export type Session = z.infer<typeof Session>;

export const RecentTracks = z.union([
  z.object({
    message: z.string(),
    error: z.number(),
  }),
  z.object({
    recenttracks: z.object({
      track: z.array(Track),
      '@attr': z.object({
        user: z.string(),
        totalPages: z.coerce.number(),
        page: z.coerce.number(),
        perPage: z.coerce.number(),
        total: z.coerce.number(),
      }),
    }),
  }),
]);

export const UserInfo = z.object({
  user: z.object({
    name: z.string(),
    age: z.coerce.number(),
    subscriber: z.string().transform((arg) => arg === '1'),
    realname: z.string(),
    bootstrap: z.string().transform((arg) => arg === '1'),
    playcount: z.coerce.number(),
    artist_count: z.coerce.number().optional(),
    track_count: z.coerce.number().optional(),
    album_count: z.coerce.number().optional(),
    image: z.array(
      z.object({
        size: z.nativeEnum(ImageSize),
        '#text': z.string(),
      }),
    ),
    registered: z.object({
      unixtime: z.coerce.number().transform((arg) => new Date(arg * 1000)),
      '#text': z.coerce.string(),
    }),
    country: z.string(),
    gender: z.string(),
    url: z.string(),
    type: z.string(),
  }),
});
export type UserInfo = z.infer<typeof UserInfo>;

export type Scrobble = {
  artist: string;
  track: string;
  timestamp: Date;
  album?: string | undefined;
  context?: string | undefined;
  streamId?: string | undefined;
  chosenByUser?: boolean | undefined;
  trackNumber?: number | undefined;
  mbid?: string | undefined;
  albumArtist?: string | undefined;
  duration?: number | undefined;
};

export async function getInfo(
  API_KEY: string,
  username: string,
): Promise<UserInfo> {
  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${username}&api_key=${API_KEY}&format=json`,
  );

  return UserInfo.parse(await res.json());
}

export async function getRecentTracks(
  API_KEY: string,
  username: string,
): Promise<Track[]> {
  const tracks: Track[] = [];

  let leftPages = 1;

  for (let page = 1; page <= leftPages; page++) {
    console.warn('Fetching page', page, '/', leftPages);
    const params = new URLSearchParams({
      api_key: API_KEY,
      format: 'json',
      limit: String(200),
      method: 'user.getrecenttracks',
      page: String(page),
      user: username,
    });

    const res = await fetch(
      `http://ws.audioscrobbler.com/2.0/?${params.toString()}`,
    );

    const obj = RecentTracks.parse(await res.json());

    if ('error' in obj) {
      throw new Error(`Last.fm Error: ${obj.error} ${obj.message}`);
    }

    console.warn('Fetched', obj.recenttracks.track.length, 'tracks');
    tracks.push(...obj.recenttracks.track);

    leftPages = obj.recenttracks['@attr'].totalPages;

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 2500));
  }
  console.warn('Successfully fetched', tracks.length, 'tracks');

  return tracks;
}

function getSig(params: [string, string][], secret: string): string {
  const md5 = createHash('md5');

  md5.update(
    params.map((kv) => kv.join('')).join('') + secret,
  );

  return String(md5.digest('hex'));
}

export async function trackScrobble(
  API_KEY: string,
  API_SECRET: string,
  sessionKey: string,
  scrobbles: Scrobble[],
) {
  if (scrobbles.length > 50) {
    throw new Error('cannot over 50 scrobbles in one time');
  }

  console.log(scrobbles);

  const method = 'track.scrobble';

  let params: [string, string][] = [
    ['api_key', API_KEY],
    ['method', method],
    ['sk', sessionKey],
  ];

  for (const [i, scrobble] of scrobbles.entries()) {
    for (const [key, value] of Object.entries(scrobble)) {
      params.push([
        `${key}[${i}]`,
        value instanceof Date
          ? String(Math.round(value.getTime() / 1000))
          : typeof value === 'boolean'
          ? value ? '1' : '0'
          : String(value),
      ]);
    }
  }

  params = params.sort();

  const sig = getSig(params, API_SECRET);

  params.push(['api_sig', sig]);
  params.push(['format', 'json']);

  const body = params.map(([key, value]) =>
    `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  ).join('&');

  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/`,
    {
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    },
  );

  return res.json();
}

export async function getToken(API_KEY: string) {
  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?method=auth.gettoken&api_key=${API_KEY}&format=json`,
  );

  const { token } = z.object({ token: z.string() }).parse(await res.json());

  return token;
}

export async function getSession(
  API_KEY: string,
  API_SECRET: string,
  token: string,
): Promise<Session> {
  const method = 'auth.getSession';

  const params = new URLSearchParams({
    api_key: API_KEY,
    method,
    token,
  });

  const sig = getSig([...params.entries()], API_SECRET);

  params.append('api_sig', sig);
  params.append('format', 'json');

  const res = await fetch(
    `http://ws.audioscrobbler.com/2.0/?${params.toString()}`,
  );

  const session = z.union([
    LastfmError,
    Session,
  ]).parse(await res.json());

  if ('error' in session) {
    throw new Error(`Last.fm Error: ${session.error} ${session.message}`);
  }

  return session;
}

export async function login(
  API_KEY: string,
  API_SECRET: string,
): Promise<Session & { token: string }> {
  const token = await getToken(API_KEY);

  console.warn(
    `Please authorize with this url: http://www.last.fm/api/auth/?api_key=${API_KEY}&token=${token}\nEnter to continue`,
  );

  for await (const _ of readLines(Deno.stdin)) {
    break;
  }

  const session = await getSession(API_KEY, API_SECRET, token);

  return { ...session, token };
}

export async function loadRecentracksFromFiles(
  recenttracksFiles: string[],
): Promise<Track[]> {
  const tracks: Track[] = [];

  console.warn('Load', recenttracksFiles.length, 'files...');

  for (const [i, recentracksFile] of recenttracksFiles.entries()) {
    console.warn('Processing file', i + 1, '/', recenttracksFiles.length);
    const trackFileText = await Deno.readTextFile(recentracksFile);

    const trackFileJson = JSON.parse(trackFileText);

    const track = await z.array(Track).parseAsync(trackFileJson);

    console.warn('Loaded', track.length, 'tracks');
    tracks.push(...track);
  }

  console.warn('Successfully loaded', tracks.length, 'tracks');

  return tracks;
}

export async function loadRecentracksFromFile(
  recenttrackFile: string,
): Promise<Track[]> {
  const tracks: Track[] = [];

  const tracksJson = await Deno.readTextFile(recenttrackFile);
  tracks.push(...await z.array(Track).parseAsync(JSON.parse(tracksJson)));

  console.warn('Successfully loaded', tracks.length, 'songs');

  return tracks;
}

if (import.meta.main) {
  const { API_KEY } = z.object({
    API_KEY: z.string().optional(),
  })
    .parse(Deno.env.toObject());

  const { output, _: recentracksFiles, username } = z.object({
    output: z.string().optional(),
    username: z.string().optional(),
    _: z.array(
      z.union([z.string(), z.number()]).transform((arg) => String(arg)),
    ),
  }).parse(parse(Deno.args, {
    string: ['output', 'username'],
  }));

  if (recentracksFiles.length === 0 && !username) {
    console.error('Recentracks or username not specifed');
    Deno.exit(1);
  }

  if (recentracksFiles.length > 0 && username) {
    console.error('Recentracks and username specifed');
    Deno.exit(1);
  }

  if (username && !API_KEY) {
    console.error('API_KEY not specifed');
    Deno.exit(1);
  }

  const tracks: Track[] = username
    ? await getRecentTracks(API_KEY!, username)
    : await loadRecentracksFromFiles(recentracksFiles);

  const text = new TextEncoder().encode(JSON.stringify(tracks));

  if (output) {
    await Deno.writeFile(output, text);
  } else {
    await Deno.stdout.write(text);
  }
}
