import block1Url from '../../assets/img/block1.png';
import block2Url from '../../assets/img/block2.png';
import mudUrl from '../../assets/img/mud.png';
import waterUrl from '../../assets/img/water.png';
import type { ImageKey } from '../../shared/types';

const assetManifest: Record<ImageKey, string> = {
  BLOCK_1: block1Url,
  BLOCK_2: block2Url,
  WATER: waterUrl,
  MUD: mudUrl,
};

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load image: ${src}`));
  image.src = src;
});

export const loadAssets = async (): Promise<Record<ImageKey, HTMLImageElement>> => {
  const entries = await Promise.all(
    Object.entries(assetManifest).map(async ([key, src]) => [key, await loadImage(src)] as const),
  );
  return Object.fromEntries(entries) as Record<ImageKey, HTMLImageElement>;
};
