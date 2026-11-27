export type TShortsSource = { kind: 'playlist' | 'video'; id: string };

export function shortsPlaylist(id: string | undefined): TShortsSource | undefined {
  const value = id?.trim();
  if (value && /^(?:PL|UU)[\w-]{10,78}$/.test(value)) return { kind: 'playlist', id: value };
  return undefined;
}

export function shortsVideo(id: string | undefined): TShortsSource | undefined {
  if (id && /^[\w-]{11}$/.test(id)) return { kind: 'video', id };
  return undefined;
}

export function shortsEmbedUrl(source: TShortsSource) {
  const url = new URL('https://www.youtube-nocookie.com/embed');
  url.searchParams.set('hl', 'ko');
  if (source.kind === 'video') {
    url.pathname += '/' + source.id;
    return url.href;
  }
  url.searchParams.set('listType', 'playlist');
  url.searchParams.set('list', source.id);
  return url.href;
}
