import { ClawdSpinner } from "./clawd-spinners.js";

const isTTY = process.stderr.isTTY ?? false;

export async function withSpinner<T>(
  label: string,
  spinner: ClawdSpinner,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isTTY) return fn();

  let i = 0;
  const timer = setInterval(() => {
    const frame = spinner.frames[i % spinner.frames.length];
    process.stderr.write(`\r  ${frame}  ${label}`);
    i++;
  }, spinner.interval);

  try {
    const result = await fn();
    clearInterval(timer);
    process.stderr.write("\r\x1b[K");
    return result;
  } catch (err) {
    clearInterval(timer);
    process.stderr.write("\r\x1b[K");
    throw err;
  }
}

export function spinSync<T>(label: string, spinner: ClawdSpinner, fn: () => T): T {
  if (!isTTY) return fn();

  // Write first frame immediately — setInterval won't tick during blocking sync work
  process.stderr.write(`\r  ${spinner.frames[0]}  ${label}`);
  let i = 1;
  const timer = setInterval(() => {
    const frame = spinner.frames[i % spinner.frames.length];
    process.stderr.write(`\r  ${frame}  ${label}`);
    i++;
  }, spinner.interval);

  try {
    const result = fn();
    clearInterval(timer);
    process.stderr.write("\r\x1b[K");
    return result;
  } catch (err) {
    clearInterval(timer);
    process.stderr.write("\r\x1b[K");
    throw err;
  }
}
