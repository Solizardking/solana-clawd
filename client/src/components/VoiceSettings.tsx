import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { VoiceSynthesis } from '@/lib/voice/VoiceSynthesis';
import { Settings } from 'lucide-react';

export function VoiceSettings() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [rate, setRate] = useState(0.9);
  const [pitch, setPitch] = useState(1.2);

  useEffect(() => {
    // Initialize voices
    const loadVoices = () => {
      const availableVoices = VoiceSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Set initial selected voice if available
      if (availableVoices.length > 0) {
        const defaultVoice = availableVoices.find(voice => 
          voice.name === 'Google UK English Male' || 
          voice.name === 'Daniel' ||
          (voice.lang.startsWith('en') && voice.name.includes('Male')) ||
          ['Daniel', 'Aaron', 'Arthur'].includes(voice.name)
        );
        if (defaultVoice) {
          setSelectedVoice(defaultVoice.name);
        }
      }
    };

    loadVoices();
    
    // Handle dynamic voice loading
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleVoiceChange = (voiceName: string) => {
    setSelectedVoice(voiceName);
    VoiceSynthesis.setVoice(voiceName);
  };

  const handleRateChange = (newRate: number[]) => {
    setRate(newRate[0]);
    VoiceSynthesis.setCharacteristics(newRate[0], pitch);
  };

  const handlePitchChange = (newPitch: number[]) => {
    setPitch(newPitch[0]);
    VoiceSynthesis.setCharacteristics(rate, newPitch[0]);
  };

  const testVoice = () => {
    VoiceSynthesis.speak("Hello! I'm Cheshire, your meme token assistant! 🎭");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-purple-400 hover:text-purple-300">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-black/90 border-purple-500/30 text-purple-200">
        <DialogHeader>
          <DialogTitle>Voice Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Voice</label>
            <Select value={selectedVoice} onValueChange={handleVoiceChange}>
              <SelectTrigger className="w-full bg-black/40 border-purple-500/30">
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent className="bg-black/90 border-purple-500/30">
                {voices.map((voice) => (
                  <SelectItem 
                    key={voice.name} 
                    value={voice.name}
                    className="text-purple-200 hover:bg-purple-500/20"
                  >
                    {voice.name} ({voice.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Speaking Rate</label>
            <Slider
              defaultValue={[rate]}
              min={0.5}
              max={2}
              step={0.1}
              onValueChange={handleRateChange}
              className="py-4"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Pitch</label>
            <Slider
              defaultValue={[pitch]}
              min={0.5}
              max={2}
              step={0.1}
              onValueChange={handlePitchChange}
              className="py-4"
            />
          </div>

          <Button
            onClick={testVoice}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
          >
            Test Voice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
