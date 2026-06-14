import { Router } from 'express';
import type { Request, Response } from 'express';
import { objectStore, type GalleryItem } from '../lib/objectStore';
import crypto from 'crypto';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await objectStore.listGalleryItems();
    res.json({ success: true, items, total: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/media/*', async (req: Request, res: Response) => {
  try {
    const key = (req.params as any)[0];
    const media = await objectStore.getMediaBuffer(key);
    if (!media) return res.status(404).send('Not found');
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(media.buffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/add', async (req: Request, res: Response) => {
  try {
    const { type, title, prompt, sourceUrl, creator, model, metadata, thumbnail } = req.body;
    if (!sourceUrl && type !== 'agent') return res.status(400).json({ error: 'sourceUrl required' });

    const item: GalleryItem = objectStore.makeItem({
      id: crypto.randomBytes(8).toString('hex'),
      type: type || 'image',
      title: title || prompt?.slice(0, 70) || 'Untitled',
      prompt,
      sourceUrl,
      thumbnail,
      creator,
      model,
      metadata,
    });

    const saved = await objectStore.saveGalleryItem(item);

    const broadcast = req.app.locals.broadcastGalleryItem as ((item: GalleryItem) => void) | undefined;
    broadcast?.(saved);

    res.json({ success: true, item: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
