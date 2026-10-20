interface IPostMediaMetadata {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export function presentPostMedia(row: IPostMediaMetadata) {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    kind: row.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO',
    url: `/api/post-media/${row.id}`,
  };
}
