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
  const url = new URL('/api/system/settings', baseUrl).toString();
  await fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frequency: frequencyMhz }),
  });
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
