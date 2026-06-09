/**
 * Clawd Code — VOICE MODE
 * Text-to-speech and voice synthesis
 */

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class VoiceMode {
  constructor(private config: any) {}

  async run(args: string[]): Promise<void> {
    const text = args.filter(a => !a.startsWith('--')).join(' ');
    
    console.log('\n[VOICE MODE] Initiating text-to-speech...\n');
    
    // Parse voice flags
    let voice = 'Clawd';
    let outputFile = `/tmp/clawd-voice-${Date.now()}.mp3`;
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--voice' && args[i + 1]) voice = args[i + 1];
      if (args[i] === '--output' && args[i + 1]) outputFile = args[i + 1];
    }
    
    console.log(`[VOICE MODE] Text: ${text}`);
    console.log(`[VOICE MODE] Voice: ${voice}`);
    console.log(`[VOICE MODE] Output: ${outputFile}`);

    // Check for sherpa-onnx (local TTS)
    const sherpaExists = existsSync(process.env.HOME + '/.clawdbot/tools/sherpa-onnx-tts/runtime/bin/sherpa-onnx-tts');
    
    if (sherpaExists) {
      await this.generateLocalTTS(text, voice, outputFile);
    } else {
      await this.generateSagTTS(text, voice, outputFile);
    }
  }

  private async generateLocalTTS(text: string, voice: string, outputFile: string): Promise<void> {
    console.log('\n[VOICE MODE] Generating via sherpa-onnx (local, zero API cost)...');
    
    const runtimeDir = process.env.HOME + '/.clawdbot/tools/sherpa-onnx-tts/runtime';
    const modelDir = process.env.SHERPA_ONNX_MODEL_DIR || 
      process.env.HOME + '/.clawdbot/tools/sherpa-onnx-tts/models/vits-piper-en_US-lessac-high';
    
    const ttsBinary = join(runtimeDir, 'bin', 'sherpa-onnx-tts');
    
    return new Promise((resolve) => {
      const proc = spawn(ttsBinary, [
        '--output', outputFile,
        '--model-file', join(modelDir, 'vits-piper-en_US-lessac-high.onnx'),
        '--tokens-file', join(modelDir, 'tokens.txt'),
        text
      ], { stdio: 'pipe' });
      
      proc.on('close', (code) => {
        if (code === 0) {
          console.log('\n[VOICE MODE] ✓ TTS generated successfully');
          console.log(`[VOICE MODE] Audio: ${outputFile}`);
          console.log('[VOICE MODE] Duration: ~12s (local TTS, zero API cost)');
        } else {
          console.log('[VOICE MODE] Local TTS failed, using sag fallback...');
          this.generateSagTTS(text, voice, outputFile).then(resolve);
        }
      });
    });
  }

  private async generateSagTTS(text: string, voice: string, outputFile: string): Promise<void> {
    console.log('\n[VOICE MODE] Generating via sag CLI (ElevenLabs/Gemini TTS)...');
    
    // Use sag speak if available
    try {
      const result = spawn('sag', ['-v', voice, '-o', outputFile, text], { stdio: 'pipe' });
      
      result.on('close', (code) => {
        if (code === 0) {
          console.log('\n[VOICE MODE] ✓ Voice generated successfully');
          console.log(`[VOICE MODE] Audio: ${outputFile}`);
          console.log('[VOICE MODE] Use # MEDIA:' + outputFile + ' to include in response');
        } else {
          console.log('\n[VOICE MODE] ⚠ Voice generation unavailable');
          console.log('[VOICE MODE] Install sherpa-onnx or set ELEVENLABS_API_KEY for voice synthesis');
          console.log('[VOICE MODE] sag -v Clawd -o /tmp/output.mp3 "Your text here"');
        }
      });
    } catch {
      console.log('\n[VOICE MODE] sag CLI not found');
      console.log('[VOICE MODE] Voice synthesis unavailable');
      console.log('[VOICE MODE] Install sag: https://github.com/your-repo/sag');
    }
  }
}