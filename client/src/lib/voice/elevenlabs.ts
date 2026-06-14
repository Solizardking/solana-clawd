import { xaiVoice } from "../xaiVoice";

class ElevenLabsVoiceService {
  constructor() {}

  async speak(text: string) {
    return xaiVoice.speak(text, "rex", 0.95);
  }
}

export const elevenLabsVoice = new ElevenLabsVoiceService();
