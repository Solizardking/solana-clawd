import { EventEmitter } from 'events';
import type { ArenaEvent } from './types';

class ClawdBus extends EventEmitter {
  private ringBuffer: ArenaEvent[] = [];
  private readonly RING_SIZE = 200;

  publish(event: Omit<ArenaEvent, 'ts'> & { ts?: number }) {
    const full: ArenaEvent = { ...event, ts: event.ts ?? Date.now() };
    this.ringBuffer.push(full);
    if (this.ringBuffer.length > this.RING_SIZE) this.ringBuffer.shift();
    this.emit('event', full);
  }

  recent(): ArenaEvent[] {
    return [...this.ringBuffer];
  }

  subscribe(handler: (event: ArenaEvent) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

export const clawdBus = new ClawdBus();
clawdBus.setMaxListeners(500);
