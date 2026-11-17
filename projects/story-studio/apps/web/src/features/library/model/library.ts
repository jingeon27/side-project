import { librarySchema, projectSchema, type TProject } from '../../story/model/story';

export const libraryKey = 'story-studio.library.v1';
export function readLibrary(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(libraryKey);
  return raw === null ? [] : librarySchema.parse(JSON.parse(raw));
}
export function writeLibrary(storage: Pick<Storage, 'setItem'>, projects: TProject[], previous?: string) {
  const serialized = JSON.stringify(librarySchema.parse(projects));
  if (serialized !== previous) storage.setItem(libraryKey, serialized);
  return serialized;
}
export function readBackup(raw: string): TProject {
  return projectSchema.parse(JSON.parse(raw));
}
export function downloadFile(value: string | Blob, name: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(value instanceof Blob ? value : new Blob([value], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
