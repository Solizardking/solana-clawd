export interface XAIVoice {
  id: string;
  name: string;
  gender?: string;
  language?: string;
}

class XAIVoiceService {
  private currentAudio: HTMLAudioElement | null = null;

  async speak(text: string, voiceId = "eve", speed = 1): Promise<void> {
    try {
      this.stop();

      const response = await fetch("/api/xai/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voiceId, speed }),
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      this.currentAudio = new Audio(url);
      this.currentAudio.volume = 1.0;

      return new Promise((resolve, reject) => {
        if (!this.currentAudio) return resolve();
        this.currentAudio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        this.currentAudio.onerror = (e) => {
          URL.revokeObjectURL(url);
          reject(e);
        };
        this.currentAudio.play().catch(reject);
      });
    } catch (err) {
      console.warn("[XAIVoice] TTS failed, falling back to browser speech:", err);
      return this.browserFallback(text);
    }
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.cancel();
    }
  }

  private browserFallback(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof speechSynthesis === "undefined") return resolve();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const voices = speechSynthesis.getVoices();
      const male = voices.find(v =>
        v.name.toLowerCase().includes("male") ||
        v.name.includes("Google UK English Male") ||
        v.name.includes("Daniel")
      );
      if (male) utter.voice = male;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      speechSynthesis.speak(utter);
    });
  }

  async getVoices(): Promise<XAIVoice[]> {
    try {
      const res = await fetch("/api/xai/tts/voices", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.voices || [];
    } catch {
      return [];
    }
  }
}

export const xaiVoice = new XAIVoiceService();
