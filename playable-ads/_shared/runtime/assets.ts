/** Decodes the inlined images (data URLs) before the ad starts. */
export function loadImages(sources: Record<string, string>): Promise<Record<string, HTMLImageElement>> {
  const entries = Object.entries(sources).map(
    ([name, url]) =>
      new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve([name, img]);
        img.onerror = () => reject(new Error(`image ${name} failed to decode`));
        img.src = url;
      }),
  );
  return Promise.all(entries).then((list) => Object.fromEntries(list));
}
