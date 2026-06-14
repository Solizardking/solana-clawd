import { elevenLabsVoice } from './voice/elevenlabs';

export class VoiceRecognition {
  recognition: SpeechRecognition;
  isListening: boolean = false;

  constructor(onResult: (text: string) => void, onError: (error: string) => void) {
    if (!('webkitSpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported');
    }

    this.recognition = new webkitSpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      onResult(text);
    };

    this.recognition.onerror = (event) => {
      onError(event.error);
    };
  }

  start() {
    if (!this.isListening) {
      this.recognition.start();
      this.isListening = true;
    }
  }

  stop() {
    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }
}

export class VoiceSynthesis {
  static async speak(text: string) {
    try {
      // Try Eleven Labs first
      await elevenLabsVoice.speak(text);
    } catch (error) {
      console.warn("Eleven Labs synthesis failed, falling back to browser:", error);
      // Fallback to browser synthesis
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      speechSynthesis.speak(utterance);
    }
  }
}