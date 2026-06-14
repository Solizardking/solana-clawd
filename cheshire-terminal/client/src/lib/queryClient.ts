import { QueryClient } from "@tanstack/react-query";

type ApiRequestOptions = RequestInit;

export type ApiResponse<T = any> = T & {
  ok: boolean;
  status: number;
  headers: Headers;
  json: () => Promise<T>;
  text: () => Promise<string>;
};

// Helper function to handle API responses
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorText;
    try {
      const errorData = await res.json();
      errorText = errorData.error || errorData.message || res.statusText;
    } catch {
      errorText = res.statusText;
    }
    throw new Error(`${res.status}: ${errorText}`);
  }
}

function enrichResponse<T = any>(data: T, res: Response): ApiResponse<T> {
  const apiBits = {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    json: async () => data,
    text: async () =>
      typeof data === "string" ? data : JSON.stringify(data),
  };

  if (Array.isArray(data)) {
    return Object.assign([...data] as any, apiBits) as ApiResponse<T>;
  }

  if (data !== null && typeof data === "object") {
    return Object.assign(data as any, apiBits) as ApiResponse<T>;
  }

  return Object.assign({ value: data } as any, apiBits) as ApiResponse<T>;
}

function normalizeApiRequestArgs(
  first: string,
  second?: string | ApiRequestOptions,
  third?: any,
): { url: string; options: ApiRequestOptions } {
  if (typeof second === "string") {
    const method = first;
    const url = second;
    const body = third;
    const options: ApiRequestOptions = { method };

    if (body !== undefined) {
      if (body instanceof FormData) {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
        options.headers = { "Content-Type": "application/json" };
      }
    }

    return { url, options };
  }

  return { url: first, options: second ?? {} };
}

export async function apiRequest<T = any>(
  url: string,
  options?: ApiRequestOptions,
): Promise<ApiResponse<T>>;
export async function apiRequest<T = any>(
  method: string,
  url: string,
  body?: any,
): Promise<ApiResponse<T>>;
export async function apiRequest<T = any>(
  first: string,
  second: string | ApiRequestOptions = {},
  third?: any,
): Promise<ApiResponse<T>> {
  const { url, options } = normalizeApiRequestArgs(first, second, third);
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      credentials: "include",
    });

    await throwIfResNotOk(res);

    if (res.status === 204 || res.headers.get("content-length") === "0") {
      return enrichResponse(null as T, res);
    }

    const data = (await res.json()) as T;
    return enrichResponse(data, res);
  } catch (error) {
    console.error("API Request Error:", error);
    throw error;
  }
}


// Default queryFn — uses the first segment of the queryKey as the URL
// and joins any remaining segments as path parts. Skips empty/undefined
// segments so `["/api/x", undefined]` won't fire a stray request.
const defaultQueryFn = async ({ queryKey }: { queryKey: readonly unknown[] }) => {
  if (!queryKey?.length) throw new Error("Missing queryKey");
  const [base, ...rest] = queryKey;
  if (typeof base !== "string") {
    throw new Error("First queryKey segment must be a URL string");
  }
  const parts = rest
    .filter((p) => p !== undefined && p !== null && p !== "")
    .map((p) => encodeURIComponent(String(p)));
  const url = parts.length ? `${base.replace(/\/$/, "")}/${parts.join("/")}` : base;

  const res = await fetch(url, { credentials: "include" });
  await throwIfResNotOk(res);
  if (res.status === 204) return null;
  return res.json();
};

// Configure the query client with defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn as any,
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30000,
    },
    mutations: {
      retry: 1,
    },
  },
});
