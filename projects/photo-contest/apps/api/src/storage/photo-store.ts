export interface IPhotoStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  /** 없는 키는 조용히 넘어간다. */
  delete(key: string): Promise<void>;
}
