import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getTigrisObject,
  hasTigrisStorageConfig,
  listTigrisKeys,
  putTigrisObject,
  tigrisPublicUrl,
} from './tigrisStorage';

const DEFAULT_BUCKET = 'cheshire-gallery';
const META_PREFIX = 'gallery/meta/';
const MEDIA_PREFIX = 'gallery/media/';

type SupabaseStorageService = SupabaseClient['storage'];
type SupabaseBucketClient = ReturnType<SupabaseStorageService['from']>;

type StorageListObject = {
  name: string;
  key?: string;
};

export interface GalleryItem {
  id: string;
  type: 'image' | 'video' | 'agent';
  title: string;
  prompt?: string;
  sourceUrl?: string;
  bucketKey?: string;
  mediaUrl?: string;
  thumbnail?: string;
  creator?: string;
  model?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

function env(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function inferContentType(key: string, fallbackType: GalleryItem['type']) {
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.webm')) return 'video/webm';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.gif')) return 'image/gif';
  return fallbackType === 'video' ? 'video/mp4' : 'image/png';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { status?: number; statusCode?: number };
  return candidate.status ?? candidate.statusCode;
}

function isAlreadyExistsError(error: unknown) {
  const status = getErrorStatus(error);
  if (status === 409) return true;
  if (error instanceof Error) {
    return /already exists|duplicate/i.test(error.message);
  }
  if (typeof error === 'object' && error) {
    const message = String((error as { message?: unknown }).message ?? '');
    return /already exists|duplicate/i.test(message);
  }
  return false;
}

function normalizeItem(item: GalleryItem): GalleryItem {
  return {
    ...item,
    mediaUrl: item.mediaUrl || (item.bucketKey ? `/api/gallery/media/${item.bucketKey}` : item.sourceUrl),
  };
}

function sortItems(items: GalleryItem[]) {
  return items
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

class ObjectStoreService {
  private clientPromise: Promise<SupabaseClient | null> | null = null;
  private memoryItems = new Map<string, GalleryItem>();
  private memoryMedia = new Map<string, { buffer: Buffer; contentType: string }>();
  private savedIds = new Set<string>();

  constructor() {
    if (hasTigrisStorageConfig()) {
      console.log('[ObjectStore] Tigris/R2 gallery storage configured with bucket:', this.bucketId());
    }
    if (this.hasSupabaseStorageConfig()) {
      console.log('[ObjectStore] Supabase gallery storage configured with bucket:', this.bucketId());
    } else {
      console.log('[ObjectStore] Supabase gallery storage not configured; using configured S3 storage or in-memory fallback');
    }
  }

  private bucketId() {
    return env('GALLERY_STORAGE_BUCKET', 'SUPABASE_STORAGE_BUCKET') || DEFAULT_BUCKET;
  }

  private supabaseUrl() {
    return env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  }

  private supabaseServiceRole() {
    return env('SUPABASE_SERVICE_ROLE', 'SUPABASE_SERVICE_ROLE_KEY');
  }

  private hasSupabaseStorageConfig() {
    return Boolean(this.supabaseUrl() && this.supabaseServiceRole());
  }

  private async getClient(): Promise<SupabaseClient | null> {
    if (!this.hasSupabaseStorageConfig()) return null;
    if (!this.clientPromise) {
      this.clientPromise = this.initializeClient().catch((err) => {
        console.warn('[ObjectStore] Could not initialize Supabase object storage; using in-memory gallery fallback:', err);
        this.clientPromise = null;
        return null;
      });
    }
    return this.clientPromise;
  }

  private async initializeClient(): Promise<SupabaseClient | null> {
    const url = this.supabaseUrl();
    const serviceRole = this.supabaseServiceRole();
    if (!url || !serviceRole) return null;

    const supabase = createClient(url, serviceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      storage: {
        useNewHostname: true,
      },
      global: {
        fetch: globalThis.fetch.bind(globalThis),
      },
    });

    const ready = await this.ensureBucket(supabase.storage);
    if (!ready) return null;

    console.log('[ObjectStore] Supabase gallery storage ready with bucket:', this.bucketId());
    return supabase;
  }

  private async ensureBucket(storage: SupabaseStorageService): Promise<boolean> {
    const bucket = this.bucketId();
    const existing = await storage.getBucket(bucket);
    if (existing.data) return true;

    const created = await storage.createBucket(bucket, { public: false });
    if (created.data || isAlreadyExistsError(created.error)) return true;

    console.warn('[ObjectStore] Supabase bucket setup failed:', created.error || existing.error);
    return false;
  }

  private async cacheMedia(item: GalleryItem, client: SupabaseClient | null): Promise<void> {
    if (!item.sourceUrl) return;

    const mediaExt = item.type === 'video' ? 'mp4' : 'png';
    const mediaKey = `${MEDIA_PREFIX}${item.type}s/${item.id}.${mediaExt}`;

    try {
      const response = await fetch(item.sourceUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) {
        item.mediaUrl = item.sourceUrl;
        return;
      }

      const contentType = response.headers.get('content-type') || inferContentType(mediaKey, item.type);
      const buffer = Buffer.from(await response.arrayBuffer());
      this.memoryMedia.set(mediaKey, { buffer, contentType });
      item.bucketKey = mediaKey;
      item.mediaUrl = `/api/gallery/media/${mediaKey}`;

      if (hasTigrisStorageConfig()) {
        try {
          await putTigrisObject(mediaKey, buffer, contentType);
          item.mediaUrl = tigrisPublicUrl(mediaKey) || item.mediaUrl;
        } catch (err) {
          console.warn('[ObjectStore] Could not persist media to Tigris/R2; using proxy or fallback media:', err);
        }
      }

      if (client) {
        const bucket = client.storage.from(this.bucketId()) as SupabaseBucketClient;
        const upload = await bucket.upload(mediaKey, buffer, {
          contentType,
          cacheControl: '86400',
          upsert: true,
        });
        if (upload.error) {
          console.warn('[ObjectStore] Could not persist media to Supabase; using in-memory media fallback:', upload.error);
        }
      }

      if (item.sourceUrl.startsWith('data:')) {
        delete item.sourceUrl;
      }
    } catch (err) {
      console.warn('[ObjectStore] Could not cache media, using source URL:', err);
      item.mediaUrl = item.sourceUrl;
    }
  }

  private async listSupabaseItems(client: SupabaseClient): Promise<GalleryItem[]> {
    const items: GalleryItem[] = [];
    const bucket = client.storage.from(this.bucketId()) as SupabaseBucketClient;
    let cursor: string | undefined;

    do {
      const page = await bucket.listV2({
        prefix: META_PREFIX,
        limit: 1000,
        cursor,
      });

      if (page.error || !page.data) {
        console.error('[ObjectStore] list error:', page.error);
        return [];
      }

      await Promise.all(
        page.data.objects.map(async (obj: StorageListObject) => {
          try {
            const key = obj.key || `${META_PREFIX}${obj.name}`;
            const result = await bucket.download(key);
            if (!result.data) return;
            const text = await result.data.text();
            const parsed = JSON.parse(text) as GalleryItem;
            items.push(normalizeItem(parsed));
          } catch {
            // Skip malformed or missing metadata objects.
          }
        }),
      );

      cursor = page.data.hasNext ? page.data.nextCursor : undefined;
    } while (cursor);

    return items;
  }

  private async listTigrisItems(): Promise<GalleryItem[]> {
    if (!hasTigrisStorageConfig()) return [];
    const items: GalleryItem[] = [];
    let keys: string[] = [];

    try {
      keys = await listTigrisKeys(META_PREFIX, 1000);
    } catch (err) {
      console.warn('[ObjectStore] Could not list Tigris/R2 metadata:', err);
      return [];
    }

    await Promise.all(
      keys.map(async (key) => {
        try {
          const stored = await getTigrisObject(key);
          if (!stored?.buffer.length) return;
          const parsed = JSON.parse(stored.buffer.toString('utf8')) as GalleryItem;
          items.push(normalizeItem(parsed));
        } catch {
          // Skip malformed or missing metadata objects.
        }
      }),
    );

    return items;
  }

  private mergeItems(storageItems: GalleryItem[]) {
    const merged = new Map<string, GalleryItem>();
    for (const item of storageItems) merged.set(item.id, normalizeItem(item));
    for (const item of this.memoryItems.values()) merged.set(item.id, normalizeItem(item));
    return sortItems(Array.from(merged.values()));
  }

  async saveGalleryItem(item: GalleryItem): Promise<GalleryItem> {
    if (this.savedIds.has(item.id)) return normalizeItem(item);
    this.savedIds.add(item.id);
    this.memoryItems.set(item.id, item);

    const client = await this.getClient();
    await this.cacheMedia(item, client);

    if (!item.mediaUrl) {
      item.mediaUrl = item.sourceUrl || item.mediaUrl;
    }

    const metaKey = `${META_PREFIX}${item.id}.json`;
    const metaBody = Buffer.from(JSON.stringify(item));

    if (hasTigrisStorageConfig()) {
      try {
        await putTigrisObject(metaKey, metaBody, 'application/json; charset=utf-8', 'public, max-age=60');
      } catch (err) {
        console.warn('[ObjectStore] Could not persist metadata to Tigris/R2; using fallback metadata:', err);
      }
    }

    if (client) {
      const bucket = client.storage.from(this.bucketId()) as SupabaseBucketClient;
      const result = await bucket.upload(metaKey, metaBody, {
        contentType: 'application/json; charset=utf-8',
        cacheControl: '60',
        upsert: true,
      });
      if (result.error) console.error('[ObjectStore] Failed to save metadata:', result.error);
    }

    this.memoryItems.set(item.id, item);

    return normalizeItem(item);
  }

  async listGalleryItems(): Promise<GalleryItem[]> {
    try {
      const [client, tigrisItems] = await Promise.all([
        this.getClient(),
        this.listTigrisItems(),
      ]);
      if (!client) return this.mergeItems(tigrisItems);

      const storageItems = await this.listSupabaseItems(client);
      return this.mergeItems([...tigrisItems, ...storageItems]);
    } catch (err) {
      console.error('[ObjectStore] listGalleryItems error:', err);
      return sortItems(Array.from(this.memoryItems.values()).map(normalizeItem));
    }
  }

  async getMediaBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const memoryMedia = this.memoryMedia.get(key);
    if (memoryMedia) return memoryMedia;

    try {
      const client = await this.getClient();
      if (client) {
        const bucket = client.storage.from(this.bucketId()) as SupabaseBucketClient;
        const result = await bucket.download(key);
        if (result.data) {
          const buffer = Buffer.from(await result.data.arrayBuffer());
          const contentType = result.data.type || inferContentType(key, key.endsWith('.mp4') || key.endsWith('.webm') ? 'video' : 'image');
          const media = { buffer, contentType };
          this.memoryMedia.set(key, media);
          return media;
        }
      }
    } catch {
      // Try Tigris/R2 before giving up.
    }

    try {
      const stored = await getTigrisObject(key);
      if (!stored) return null;
      const media = {
        buffer: stored.buffer,
        contentType: stored.contentType || inferContentType(key, key.endsWith('.mp4') || key.endsWith('.webm') ? 'video' : 'image'),
      };
      this.memoryMedia.set(key, media);
      return media;
    } catch {
      return null;
    }
  }

  makeItem(partial: Partial<GalleryItem> & { type: GalleryItem['type']; sourceUrl: string }): GalleryItem {
    return {
      id: crypto.randomBytes(8).toString('hex'),
      title: partial.prompt?.slice(0, 70) || 'Untitled',
      createdAt: new Date().toISOString(),
      ...partial,
    };
  }
}

export const objectStore = new ObjectStoreService();
