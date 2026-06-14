import type { GalleryItem } from "./objectStore";

type GalleryItemListener = (item: GalleryItem) => void;

const listeners = new Set<GalleryItemListener>();

export function onGalleryItemAdded(listener: GalleryItemListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishGalleryItem(item: GalleryItem): void {
  for (const listener of listeners) {
    try {
      listener(item);
    } catch (error) {
      console.warn("[galleryRealtime] listener failed:", error);
    }
  }
}
