export function mediaDownloadFilename(title: string, key: string): string {
  const extension = key.split('.').at(-1);
  const name = title
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return `${[...name].slice(0, 80).join('') || '웃긴순간'}.${extension}`;
}

export function mediaDownloadDisposition(filename: string): string {
  const extension = filename.split('.').at(-1);
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="funny-moment.${extension}"; filename*=UTF-8''${encoded}`;
}
