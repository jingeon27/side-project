import episodesData from './episodes.json' with { type: 'json' };
import type { TTopic } from './topics';

interface IEpisode {
  slug: string;
  title: string;
  topic: TTopic;
  hook: string;
  description: string;
  action: string;
  message: string;
  alternative: string;
  image?: string;
  youtubeVideoId?: string;
}

export const episodes = episodesData as readonly IEpisode[];

export function findEpisode(slug: string) {
  return episodes.find((episode) => episode.slug === slug);
}

export function episodePath(slug: string) {
  return '/cards/' + slug;
}
