import { Router } from "express";
import { memeService } from "../lib/meme/memeService";
import { objectStore } from "../lib/objectStore";

const router = Router();

router.get("/templates", (req, res) => {
  try {
    const templates = memeService.getMemeTemplates();
    res.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch meme templates" });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const { templateId, topText, bottomText } = req.body;
    
    // Find the template
    const template = memeService.getMemeTemplates().find(t => t.id === templateId);
    if (!template) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    // Generate the prompt
    const prompt = `${template.prompt}, with text "${topText}" at the top and "${bottomText}" at the bottom, meme style`;
    
    // Generate the image
    const imageBase64 = await memeService.generateMemeImage({ prompt });
    const item = objectStore.makeItem({
      type: 'image',
      title: `${template.name} meme`.slice(0, 70),
      prompt,
      sourceUrl: imageBase64,
      model: 'black-forest-labs/FLUX.1-dev',
      creator: 'site:meme-generator',
      metadata: {
        source: 'site',
        route: '/api/memes/generate',
        templateId,
        topText,
        bottomText,
      },
    });
    objectStore.saveGalleryItem(item).catch((err) => {
      console.warn("Could not save generated meme to gallery storage:", err);
    });
    
    res.json({ 
      success: true,
      image: imageBase64
    });
  } catch (error) {
    console.error("Error generating meme:", error);
    res.status(500).json({ error: "Failed to generate meme" });
  }
});

export default router;
