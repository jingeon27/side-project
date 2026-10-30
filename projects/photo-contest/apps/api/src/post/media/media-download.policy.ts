export function mediaDownloadFilename(title: string, key: string): string {
  const extension = key.split('.').at(-1);
  const name = title
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  return `${[...name].slice(0, 80).join('') || '피식'}.${extension}`;
}

export function mediaDownloadDisposition(filename: string): string {
  const extension = filename.split('.').at(-1);
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="byeolsadae.${extension}"; filename*=UTF-8''${encoded}`;
}
