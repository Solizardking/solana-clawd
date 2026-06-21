export type FlowStatus = "queued" | "start" | "done" | "error";

export interface FlowEvent {
  id: string;
  ts: number;
  kind: "chat" | "inference" | "async" | "warmup" | "solgpt";
  route: string;
  status: FlowStatus;
  model?: string;
  request_id?: string;
  peer?: string;
  elapsed_ms?: number;
  error?: string;
}

const MAX_EVENTS = 120;
const events: FlowEvent[] = [];

export function recordFlow(event: Omit<FlowEvent, "id" | "ts"> & { id?: string; ts?: number }): FlowEvent {
  const item: FlowEvent = {
    id: event.id ?? `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: event.ts ?? Date.now(),
    ...event,
  };
  events.push(item);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return item;
}

export function recentFlow(limit = 80): FlowEvent[] {
  return events.slice(-limit);
}
