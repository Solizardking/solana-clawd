/**
 * VoiceAgent — AssemblyAI Voice Agent with on-chain trading tools.
 *
 * Tools available to the agent:
 *   get_price          – current CLAWD/SOL price + TVL
 *   get_swap_quote     – quote for SOL↔CLAWD swap
 *   execute_swap       – build tx, sign with wallet, submit
 *   get_wallet_balance – user's SOL + CLAWD balances
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { Mic, MicOff, Loader2, Volume2, VolumeX } from 'lucide-react';
import { meteoraSwap } from '@/lib/meteoraSwap';

// ── PCM AudioWorklet (inlined as blob) ───────────────────────────────────────
const WORKLET_SRC = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) {
      const buf = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++)
        buf[i] = Math.max(-32768, Math.min(32767, ch[i] * 32767));
      this.port.postMessage(buf.buffer, [buf.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmProcessor);
`;

const SAMPLE_RATE = 24_000;

// ── Tool definitions sent to AssemblyAI ──────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    name: 'get_price',
    description: 'Get the current CLAWD/SOL price, TVL, and 24-hour volume from the Meteora DAMM V2 pool.',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'function',
    name: 'get_swap_quote',
    description: 'Get a quote for swapping SOL to CLAWD or CLAWD to SOL. Always call this before execute_swap.',
    parameters: {
      type: 'object',
      properties: {
        input_token: { type: 'string', enum: ['SOL', 'CLAWD'], description: 'Token to sell' },
        amount: { type: 'number', description: 'Amount of input_token to swap' },
        slippage_pct: { type: 'number', description: 'Slippage tolerance percent, default 1.0' },
      },
      required: ['input_token', 'amount'],
    },
  },
  {
    type: 'function',
    name: 'execute_swap',
    description: 'Execute a confirmed swap. Builds the Solana transaction, requests the user wallet signature, and submits it on-chain. Only call after the user has explicitly confirmed.',
    parameters: {
      type: 'object',
      properties: {
        input_token: { type: 'string', enum: ['SOL', 'CLAWD'], description: 'Token to sell' },
        amount: { type: 'number', description: 'Amount of input_token to swap' },
        slippage_pct: { type: 'number', description: 'Slippage tolerance percent, default 1.0' },
      },
      required: ['input_token', 'amount'],
    },
  },
  {
    type: 'function',
    name: 'get_wallet_balance',
    description: "Get the user's current SOL and CLAWD token balances from their connected wallet.",
    parameters: { type: 'object', properties: {} },
  },
];

const SOL_MINT  = 'So11111111111111111111111111111111111111112';
const CLAWD_MINT = 'CiNBpxMkpQVfTvtHF5rXAj2N4FZXMJWFVi9Q6UkBiez8';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Msg { role: 'user' | 'agent'; text: string; ts: number }

// ── Component ─────────────────────────────────────────────────────────────────
export function VoiceAgent() {
  const { connected, publicKey, signTransaction } = useWallet();

  const [status, setStatus]   = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [muted, setMuted]     = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking]   = useState(false);
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef     = useRef<WebSocket | null>(null);
  const ctxRef    = useRef<AudioContext | null>(null);
  const micRef    = useRef<MediaStream | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const playTRef  = useRef(0);
  const blobUrlRef = useRef<string | null>(null);
  const endRef    = useRef<HTMLDivElement | null>(null);
  const pendingToolResultsRef = useRef<Array<{ call_id: string; result: unknown }>>([]);

  // Keep publicKey accessible inside WS callbacks
  const pkRef = useRef(publicKey);
  useEffect(() => { pkRef.current = publicKey; }, [publicKey]);
  const signRef = useRef(signTransaction);
  useEffect(() => { signRef.current = signTransaction; }, [signTransaction]);

  // Auto-scroll transcript
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcript]);

  const addMsg = useCallback((role: Msg['role'], text: string) => {
    setTranscript(prev => [...prev, { role, text, ts: Date.now() }]);
  }, []);

  // ── Tool execution ──────────────────────────────────────────────────────────
  async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'get_price': {
        const info = await meteoraSwap.poolInfo();
        return {
          clawdPerSol: info.clawdPerSol,
          solPerClawd: info.solPerClawd,
          clawdReserve: info.tokenAAmount,
          solReserve: info.tokenBAmount,
          feeBps: info.feeBps,
          liquidityReady: info.liquidityReady,
          clawdUsdEstimate: info.clawdUsdEstimate,
        };
      }

      case 'get_swap_quote': {
        const { input_token, amount, slippage_pct = 1 } = args as {
          input_token: 'SOL' | 'CLAWD'; amount: number; slippage_pct?: number;
        };
        const inputMint  = input_token === 'SOL' ? SOL_MINT : CLAWD_MINT;
        const outputMint = input_token === 'SOL' ? CLAWD_MINT : SOL_MINT;
        const q = await meteoraSwap.quote(inputMint, outputMint, amount, slippage_pct);
        return {
          inputToken: input_token,
          outputToken: input_token === 'SOL' ? 'CLAWD' : 'SOL',
          inputAmount: q.meteora.inputAmount,
          outputAmount: q.meteora.outputAmount,
          minOutputAmount: q.meteora.minOutputAmount,
          priceImpactPct: q.meteora.priceImpactPct,
          feePct: q.meteora.feePct,
          comparison: q.comparison.message,
        };
      }

      case 'execute_swap': {
        const pk = pkRef.current;
        const sign = signRef.current;
        if (!pk || !sign) {
          return { success: false, error: 'Wallet not connected. Ask the user to connect their Solana wallet.' };
        }

        const { input_token, amount, slippage_pct = 1 } = args as {
          input_token: 'SOL' | 'CLAWD'; amount: number; slippage_pct?: number;
        };
        const inputMint  = input_token === 'SOL' ? SOL_MINT : CLAWD_MINT;
        const outputMint = input_token === 'SOL' ? CLAWD_MINT : SOL_MINT;

        setToolStatus(`Building ${input_token} → ${input_token === 'SOL' ? 'CLAWD' : 'SOL'} swap…`);

        const { transaction: txB64 } = await meteoraSwap.buildSwap({
          inputMint, outputMint, amount,
          userWallet: pk.toString(),
          slippage: slippage_pct,
        });

        setToolStatus('Waiting for wallet signature…');
        const txBuffer = Buffer.from(txB64, 'base64');
        let tx: Transaction | VersionedTransaction;
        try { tx = VersionedTransaction.deserialize(txBuffer); }
        catch { tx = Transaction.from(txBuffer); }

        const signed = await sign(tx as any);
        const serialized = Buffer.from(
          'serialize' in signed ? (signed as VersionedTransaction).serialize()
            : (signed as Transaction).serialize(),
        ).toString('base64');

        setToolStatus('Submitting to Solana…');
        const { signature, explorerUrl } = await meteoraSwap.submit(serialized);
        setToolStatus(null);

        return {
          success: true,
          signature,
          explorerUrl,
          inputAmount: amount,
          inputToken: input_token,
          outputToken: input_token === 'SOL' ? 'CLAWD' : 'SOL',
        };
      }

      case 'get_wallet_balance': {
        const pk = pkRef.current;
        if (!pk) return { error: 'Wallet not connected.' };
        const r = await fetch(`/api/clawd-portfolio/balances?wallet=${pk.toString()}`);
        if (!r.ok) {
          // fallback: just return pool info which has reserve data
          const info = await meteoraSwap.livePrice();
          return { note: 'Detailed balance unavailable; showing pool reserves', poolData: info };
        }
        return r.json();
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMsg(null);
    setTranscript([]);

    try {
      // 1. Get temp token from our server
      const tokenRes = await fetch('/api/voice-agent/token', { method: 'POST' });
      if (!tokenRes.ok) {
        const e = await tokenRes.json().catch(() => ({}));
        throw new Error((e as any).error ?? `Token fetch failed: ${tokenRes.status}`);
      }
      const { token } = await tokenRes.json() as { token: string };

      // 2. Set up AudioContext + AudioWorklet
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      await ctx.resume();

      if (!blobUrlRef.current) {
        blobUrlRef.current = URL.createObjectURL(
          new Blob([WORKLET_SRC], { type: 'application/javascript' }),
        );
      }
      await ctx.audioWorklet.addModule(blobUrlRef.current);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      });

      const source  = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pcm-capture');

      ctxRef.current   = ctx;
      micRef.current   = stream;
      workletRef.current = worklet;

      // 3. Open WebSocket
      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        const systemPrompt = [
          'You are the Cheshire Terminal voice trading assistant.',
          'You help users trade CLAWD tokens on Solana via the Meteora DAMM V2 liquidity pool.',
          '',
          'BE SHORT. Keep every response under 2 sentences. This is the most important rule.',
          '',
          'Rules:',
          '- Always call get_price or get_swap_quote before execute_swap unless the user already confirmed a quoted amount.',
          '- Interpret natural trade phrases: "buy 0.1 SOL of CLAWD", "ape .25 SOL into CLAWD", and "long CLAWD with 1 SOL" all mean input_token SOL with that SOL amount.',
          '- Interpret "sell 100 CLAWD", "dump 100 CLAWD", and "exit 100 CLAWD" as input_token CLAWD with that CLAWD amount.',
          '- Only call execute_swap after the user says yes, confirm, go, or similar.',
          '- State prices as specific numbers. Never approximate.',
          '- Say CLAWD not C-L-A-W-D. Say SOL for Solana.',
          '- No markdown. No bullet points. Plain speech only.',
          '- If wallet not connected, tell the user and stop.',
          "- When a swap executes, read the first 8 characters of the signature and say 'transaction confirmed'.",
        ].join('\n');

        ws.send(JSON.stringify({
          type: 'session.update',
          session: {
            system_prompt: systemPrompt,
            greeting: "Cheshire trading desk. What do you want to do?",
            tools: TOOLS,
            input:  {
              format: { encoding: 'audio/pcm' },
              keyterms: ['CLAWD', 'Solana', 'Meteora', 'DFlow', 'Pump Fun', 'Raydium', 'Birdeye', 'Helius'],
              turn_detection: {
                vad_threshold: 0.5,
                min_silence: 700,
                max_silence: 2400,
                interrupt_response: true,
              },
            },
            output: { voice: 'ivy', format: { encoding: 'audio/pcm' } },
          },
        }));
      };

      ws.onmessage = async ({ data }) => {
        const m = JSON.parse(data as string);

        switch (m.type) {
          case 'session.ready':
            setStatus('live');
            // Start streaming mic audio
            worklet.port.onmessage = ({ data: buf }) => {
              if (ws.readyState !== WebSocket.OPEN || muted) return;
              const bytes = new Uint8Array(buf as ArrayBuffer);
              let s = '';
              for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
              ws.send(JSON.stringify({ type: 'input.audio', audio: btoa(s) }));
            };
            source.connect(worklet).connect(ctx.destination);
            break;

          case 'input.speech.started':  setUserSpeaking(true);  break;
          case 'input.speech.stopped':  setUserSpeaking(false); break;
          case 'reply.started':         setAgentSpeaking(true); break;

          case 'reply.audio': {
            const raw = atob(m.data as string);
            const pcm = new Int16Array(raw.length / 2);
            for (let i = 0; i < pcm.length; i++)
              pcm[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
            const f32 = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
            const buf = ctx.createBuffer(1, f32.length, SAMPLE_RATE);
            buf.getChannelData(0).set(f32);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            playTRef.current = Math.max(playTRef.current, ctx.currentTime);
            src.start(playTRef.current);
            playTRef.current += buf.duration;
            break;
          }

          case 'reply.done':
            setAgentSpeaking(false);
            if ((m as any).status === 'interrupted') {
              playTRef.current = ctx.currentTime;
              pendingToolResultsRef.current = [];
            } else if (pendingToolResultsRef.current.length > 0) {
              for (const tool of pendingToolResultsRef.current) {
                ws.send(JSON.stringify({
                  type: 'tool.result',
                  call_id: tool.call_id,
                  result: JSON.stringify(tool.result),
                }));
              }
              pendingToolResultsRef.current = [];
            }
            break;

          case 'transcript.user':
            addMsg('user', (m as any).text);
            break;

          case 'transcript.agent':
            addMsg('agent', (m as any).text);
            break;

          case 'tool.call': {
            const toolName = (m as any).name as string;
            const rawArgs = (m as any).arguments ?? {};
            const toolArgs = typeof rawArgs === 'string'
              ? JSON.parse(rawArgs || '{}') as Record<string, unknown>
              : rawArgs as Record<string, unknown>;
            const callId   = (m as any).call_id as string;
            setToolStatus(`Running ${toolName}…`);
            let result: unknown;
            try {
              result = await executeTool(toolName, toolArgs);
            } catch (e: any) {
              result = { error: e?.message ?? String(e) };
            }
            setToolStatus(null);
            pendingToolResultsRef.current.push({ call_id: callId, result });
            break;
          }

          case 'session.error':
            setErrorMsg((m as any).message ?? 'Voice agent error');
            break;
        }
      };

      ws.onclose = () => { setStatus('idle'); setAgentSpeaking(false); setUserSpeaking(false); };
      ws.onerror = () => { setStatus('error'); setErrorMsg('Connection failed'); };

    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message ?? 'Failed to connect');
    }
  }, [addMsg, muted]);

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    wsRef.current?.close();
    micRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    wsRef.current = ctxRef.current = micRef.current = workletRef.current = null;
    playTRef.current = 0;
    pendingToolResultsRef.current = [];
    setStatus('idle');
    setAgentSpeaking(false);
    setUserSpeaking(false);
    setToolStatus(null);
  }, []);

  useEffect(() => () => { disconnect(); }, [disconnect]);

  // ── Mute toggle ─────────────────────────────────────────────────────────────
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    micRef.current?.getTracks().forEach(t => { t.enabled = !next; });
  };

  const isLive = status === 'live';
  const isConnecting = status === 'connecting';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status orb */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div
              className={[
                'w-3 h-3 rounded-full',
                isLive ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : status === 'error' ? 'bg-red-500' : 'bg-zinc-600',
                agentSpeaking ? 'animate-ping absolute' : '',
              ].join(' ')}
            />
            {agentSpeaking && (
              <div className="w-3 h-3 rounded-full bg-emerald-400 absolute" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-200 leading-none">
              Voice Trading Desk
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isLive
                ? agentSpeaking ? 'Agent speaking…'
                : userSpeaking  ? 'Listening…'
                : toolStatus    ? toolStatus
                : 'Ready'
                : isConnecting  ? 'Connecting…'
                : status === 'error' ? errorMsg ?? 'Error'
                : 'Disconnected'}
            </p>
          </div>
        </div>

        {/* Wallet badge */}
        <div className={[
          'text-xs px-2 py-1 rounded-full font-mono border',
          connected
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
            : 'bg-zinc-900 border-zinc-700 text-zinc-500',
        ].join(' ')}>
          {connected ? `${publicKey!.toString().slice(0, 4)}…${publicKey!.toString().slice(-4)}` : 'no wallet'}
        </div>
      </div>

      {!connected && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-400">
          Connect your Solana wallet to enable trade execution. You can still get prices and quotes without it.
        </div>
      )}

      {/* Transcript */}
      <div className="flex-1 min-h-0 rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-y-auto p-4 flex flex-col gap-3">
        {transcript.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 text-sm gap-2 select-none">
            <Mic className="w-8 h-8 opacity-30" />
            <p>Click Connect, then speak a command.</p>
            <p className="text-xs opacity-60 text-center max-w-xs">
              Try: "What's the CLAWD price?" · "Buy 0.1 SOL of CLAWD" · "Show my balance"
            </p>
          </div>
        ) : (
          <>
            {transcript.map((msg, i) => (
              <div
                key={i}
                className={[
                  'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                  msg.role === 'user'
                    ? 'self-end bg-indigo-900/60 border border-indigo-700/40 text-indigo-100'
                    : 'self-start bg-zinc-800/80 border border-zinc-700/40 text-zinc-100',
                ].join(' ')}
              >
                <div className={[
                  'text-[10px] font-semibold uppercase tracking-wider mb-1',
                  msg.role === 'user' ? 'text-indigo-400' : 'text-emerald-400',
                ].join(' ')}>
                  {msg.role === 'user' ? 'You' : 'Agent'}
                </div>
                {msg.text}
              </div>
            ))}
            {toolStatus && (
              <div className="self-start flex items-center gap-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {toolStatus}
              </div>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          onClick={isLive || isConnecting ? disconnect : connect}
          disabled={isConnecting}
          className={[
            'flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
            isLive
              ? 'bg-red-900/70 border border-red-700 text-red-300 hover:bg-red-800/70'
              : isConnecting
              ? 'bg-zinc-800 border border-zinc-700 text-zinc-400 cursor-not-allowed'
              : 'bg-emerald-900/60 border border-emerald-700 text-emerald-300 hover:bg-emerald-800/60',
          ].join(' ')}
        >
          {isConnecting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting…</>
            : isLive
            ? <><MicOff className="w-4 h-4" /> Disconnect</>
            : <><Mic className="w-4 h-4" /> Connect</>}
        </button>

        {isLive && (
          <button
            onClick={toggleMute}
            className={[
              'rounded-xl px-4 py-3 text-sm font-semibold border transition-all',
              muted
                ? 'bg-amber-900/60 border-amber-700 text-amber-300 hover:bg-amber-800/60'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700',
            ].join(' ')}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Tool hint */}
      <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
        Powered by AssemblyAI · CLAWD/SOL via Meteora DAMM V2 · Solana mainnet
      </p>
    </div>
  );
}
