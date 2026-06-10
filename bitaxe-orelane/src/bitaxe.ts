export interface BitaxeSystemInfo {
  boardVersion: string;
  version: string;
  axeOSVersion: string;
  hashRate: number;
  hashRate_1m: number;
  hashRate_10m: number;
  hashRate_1h: number;
  expectedHashrate: number;
  power: number;
  current: number;
  voltage: number;
  temp: number;
  temp2: number;
  vrTemp: number;
  cpuUsage: number;
  freeHeap: number;
  wifiStatus: string;
  wifiRSSI: number;
  poolDifficulty: number;
  networkDifficulty: number;
  miningPaused: boolean;
  overheat_mode: number;
  sharesAccepted: number;
  sharesRejected: number;
  uptimeSeconds: number;
  stratumURL: string;
  stratumProtocol: string;
}

export interface BitaxeLimits {
  maxTempC: number;
  maxCpuUsage: number;
  minFreeHeapBytes: number;
  minWifiRssi: number;
}

export interface BitaxeSafetyReport {
  healthy: boolean;
  reasons: string[];
}

export interface BitaxeLedColor {
  red: number;
  green: number;
  blue: number;
  name?: string;
}

export interface BitaxeLedResponse {
  message: string;
  applied?: boolean;
  color?: BitaxeLedColor;
  enabled?: boolean;
  mode?: 'off' | 'solid' | 'cycle' | string;
  brightnessPercent?: number;
}

export const BITAXE_LED_COLORS: Record<string, BitaxeLedColor> = {
  off: { red: 0, green: 0, blue: 0, name: 'off' },
  red: { red: 255, green: 0, blue: 0, name: 'red' },
  orange: { red: 255, green: 96, blue: 0, name: 'orange' },
  yellow: { red: 255, green: 220, blue: 0, name: 'yellow' },
  green: { red: 0, green: 255, blue: 32, name: 'green' },
  cyan: { red: 0, green: 200, blue: 255, name: 'cyan' },
  blue: { red: 0, green: 64, blue: 255, name: 'blue' },
  purple: { red: 160, green: 0, blue: 255, name: 'purple' },
  pink: { red: 255, green: 32, blue: 160, name: 'pink' },
  white: { red: 255, green: 255, blue: 255, name: 'white' },
};

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Bitaxe API ${res.status} ${res.statusText} for ${url}`);
    }
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBitaxeSystemInfo(baseUrl: string): Promise<BitaxeSystemInfo> {
  const url = new URL('/api/system/info', baseUrl).toString();
  const raw = await fetchJson<Partial<BitaxeSystemInfo>>(url);
  return {
    boardVersion: raw.boardVersion ?? 'unknown',
    version: raw.version ?? 'unknown',
    axeOSVersion: raw.axeOSVersion ?? 'unknown',
    hashRate: raw.hashRate ?? 0,
    hashRate_1m: raw.hashRate_1m ?? raw.hashRate ?? 0,
    hashRate_10m: raw.hashRate_10m ?? raw.hashRate ?? 0,
    hashRate_1h: raw.hashRate_1h ?? raw.hashRate ?? 0,
    expectedHashrate: raw.expectedHashrate ?? 0,
    power: raw.power ?? 0,
    current: raw.current ?? 0,
    voltage: raw.voltage ?? 0,
    temp: raw.temp ?? 0,
    temp2: raw.temp2 ?? 0,
    vrTemp: raw.vrTemp ?? 0,
    cpuUsage: raw.cpuUsage ?? 0,
    freeHeap: raw.freeHeap ?? 0,
    wifiStatus: raw.wifiStatus ?? 'unknown',
    wifiRSSI: raw.wifiRSSI ?? -90,
    poolDifficulty: raw.poolDifficulty ?? 0,
    networkDifficulty: raw.networkDifficulty ?? 0,
    miningPaused: raw.miningPaused ?? false,
    overheat_mode: raw.overheat_mode ?? 0,
    sharesAccepted: raw.sharesAccepted ?? 0,
    sharesRejected: raw.sharesRejected ?? 0,
    uptimeSeconds: raw.uptimeSeconds ?? 0,
    stratumURL: raw.stratumURL ?? 'unknown',
    stratumProtocol: raw.stratumProtocol ?? 'SV1',
  };
}

export async function pauseBitaxeMining(baseUrl: string): Promise<void> {
  const url = new URL('/api/system/pause', baseUrl).toString();
  await fetchJson(url, { method: 'POST' });
}

export async function resumeBitaxeMining(baseUrl: string): Promise<void> {
  const url = new URL('/api/system/resume', baseUrl).toString();
  await fetchJson(url, { method: 'POST' });
}

export async function rebootBitaxe(baseUrl: string): Promise<void> {
  const url = new URL('/api/system/restart', baseUrl).toString();
  await fetchJson(url, { method: 'POST' });
}

export async function setBitaxeFrequency(baseUrl: string, frequencyMhz: number): Promise<void> {
  const url = new URL('/api/system', baseUrl).toString();
  await fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frequency: frequencyMhz }),
  });
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function parseBitaxeLedColor(raw: string | undefined): BitaxeLedColor | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  if (BITAXE_LED_COLORS[value]) {
    return { ...BITAXE_LED_COLORS[value] };
  }

  const hex = value.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const intValue = Number.parseInt(hex[1], 16);
    return {
      red: (intValue >> 16) & 0xff,
      green: (intValue >> 8) & 0xff,
      blue: intValue & 0xff,
      name: `#${hex[1].toLowerCase()}`,
    };
  }

  const rgb = value.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
  if (rgb) {
    return {
      red: clampColor(Number(rgb[1])),
      green: clampColor(Number(rgb[2])),
      blue: clampColor(Number(rgb[3])),
      name: `${clampColor(Number(rgb[1]))},${clampColor(Number(rgb[2]))},${clampColor(Number(rgb[3]))}`,
    };
  }

  return null;
}

export async function setBitaxeBaseLed(baseUrl: string, color: BitaxeLedColor, brightnessPercent = 18): Promise<BitaxeLedResponse> {
  const url = new URL('/api/orelane/led', baseUrl).toString();
  const response = await fetchJson<Omit<BitaxeLedResponse, 'message' | 'color'>>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: color.name === 'off' ? 'off' : 'solid',
      red: color.red,
      green: color.green,
      blue: color.blue,
      brightnessPercent,
    }),
  });

  return {
    ...response,
    color,
    applied: response.enabled,
    message: response.enabled === false
      ? 'base LED command accepted, but firmware reports LED support is disabled'
      : `base LED set to ${color.name ?? `${color.red},${color.green},${color.blue}`}`,
  };
}

export async function cycleBitaxeBaseLed(baseUrl: string, brightnessPercent = 18): Promise<BitaxeLedResponse> {
  const url = new URL('/api/orelane/led', baseUrl).toString();
  const response = await fetchJson<Omit<BitaxeLedResponse, 'message'>>(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'cycle', brightnessPercent }),
  });

  return {
    ...response,
    applied: response.enabled,
    message: response.enabled === false
      ? 'base LED cycle command accepted, but firmware reports LED support is disabled'
      : 'base LED color cycle enabled',
  };
}

export function computeEfficiency(info: BitaxeSystemInfo): number {
  if (info.hashRate <= 0 || info.power <= 0) return 0;
  return info.power / info.hashRate;
}

export function evaluateBitaxeSafety(info: BitaxeSystemInfo, limits: BitaxeLimits): BitaxeSafetyReport {
  const reasons: string[] = [];

  if (info.temp > limits.maxTempC) {
    reasons.push(`chip temp ${info.temp}C > ${limits.maxTempC}C`);
  }
  if (info.cpuUsage > limits.maxCpuUsage) {
    reasons.push(`CPU ${info.cpuUsage}% > ${limits.maxCpuUsage}%`);
  }
  if (info.freeHeap < limits.minFreeHeapBytes) {
    reasons.push(`freeHeap ${info.freeHeap} < ${limits.minFreeHeapBytes}`);
  }
  if (info.wifiRSSI < limits.minWifiRssi) {
    reasons.push(`wifiRSSI ${info.wifiRSSI} < ${limits.minWifiRssi}`);
  }
  if (info.miningPaused) {
    reasons.push('Bitaxe mining is paused');
  }

  return {
    healthy: reasons.length === 0,
    reasons,
  };
}
