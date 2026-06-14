// @ts-nocheck
class VoiceSynthesisService {
  private synthesis: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;
  private defaultRate = 0.95;  // Slightly slower for character
  private defaultPitch = 1.0; // Neutral pitch for male voice

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.selectVoice();
  }

  private selectVoice() {
    // Wait for voices to be loaded
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = () => {
        const voices = this.synthesis.getVoices();
        console.log("Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(', '));
        
        // Prioritized list of male voice names and patterns
        const maleVoiceOptions = [
          // Google's male voice is widely available
          voice => voice.name === 'Google UK English Male',
          
          // Common male voices by name
          voice => ['Daniel', 'Aaron', 'Arthur', 'Thomas', 'Guy', 'David', 'James', 'John', 'Josh', 'Paul'].includes(voice.name),
          
          // Voices with "Male" in the name
          voice => voice.name.includes('Male'),
          
          // Microsoft male voices
          voice => voice.name.startsWith('Microsoft') && 
                  ['David', 'Mark', 'James', 'Richard'].some(name => voice.name.includes(name)),
          
          // English male voices
          voice => voice.lang.startsWith('en') && voice.name.includes('Male'),
          
          // Any voice with probable male name
          voice => voice.name.match(/(Guy|David|James|John|Paul|Mark|Richard|Thomas|Tim|Tom|Rob|Peter|Jack|Josh|Alan)/i) !== null
        ];
        
        // Try each option in order until we find a match
        let maleVoice = null;
        for (const option of maleVoiceOptions) {
          maleVoice = voices.find(option);
          if (maleVoice) {
            console.log("Found male voice:", maleVoice.name);
            break;
          }
        }
        
        if (maleVoice) {
          this.voice = maleVoice;
        } else {
          // Last resort: any English voice
          this.voice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
          console.log("No male voice found, using fallback:", this.voice?.name);
        }

        console.log("Selected voice:", this.voice?.name);
      };
      
      // Force initialization if voices are already loaded
      if (this.synthesis.getVoices().length > 0) {
        const event = new Event('voiceschanged');
        speechSynthesis.dispatchEvent(event);
      }
    }
  }

  // Get available voices
  getVoices(): SpeechSynthesisVoice[] {
    return this.synthesis?.getVoices() || [];
  }

  // Set voice by name
  setVoice(voiceName: string) {
    const voices = this.getVoices();
    const newVoice = voices.find(v => v.name === voiceName);
    if (newVoice) {
      this.voice = newVoice;
      return true;
    }
    return false;
  }

  // Set voice characteristics
  setCharacteristics(rate?: number, pitch?: number) {
    if (rate !== undefined) this.defaultRate = Math.max(0.1, Math.min(2, rate));
    if (pitch !== undefined) this.defaultPitch = Math.max(0, Math.min(2, pitch));
  }

  speak(text: string, options: { rate?: number; pitch?: number } = {}) {
    if (!this.synthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Cancel any ongoing speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Use configured voice if available
    if (this.voice) {
      utterance.voice = this.voice;
    }

    // Apply voice characteristics with optional overrides
    utterance.rate = options.rate ?? this.defaultRate;
    utterance.pitch = options.pitch ?? this.defaultPitch;
    utterance.volume = 0.9;

    // Add some personality with SSML-like processing
    const processedText = text
      .replace(/!/g, '! <break time="200ms"/>') // Add pause after exclamation
      .replace(/\?/g, '? <break time="300ms"/>') // Add pause after question
      .replace(/\.\s/g, '. <break time="150ms"/>'); // Add pause after sentence

    utterance.text = processedText;

    this.synthesis.speak(utterance);
  }

  // Cancel ongoing speech
  cancel() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }
}

export const VoiceSynthesis = new VoiceSynthesisService();
