export function localImageReady(config?: { textReady?: boolean; imageReady?: boolean } | null) {
  return config?.textReady === true && config.imageReady === true;
}
