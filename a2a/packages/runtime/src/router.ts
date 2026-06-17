type Handler = (request: Request, params: Record<string, string>) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function compilePath(path: string) {
  const keys: string[] = [];
  const pattern = path
    .replace(/\/+$/, "")
    .replace(/:[^/]+/g, (segment) => {
      keys.push(segment.slice(1));
      return "([^/]+)";
    });
  return { pattern: new RegExp(`^${pattern || "/"}$`), keys };
}

export class SvmRouter {
  private readonly routes: Route[] = [];

  get(path: string, handler: Handler) {
    this.add("GET", path, handler);
  }

  post(path: string, handler: Handler) {
    this.add("POST", path, handler);
  }

  route(prefix: string, router: SvmRouter) {
    for (const route of router.routes) {
      const source = route.pattern.source.replace(/^\^/, "").replace(/\$$/, "");
      const mounted = source === "/" || source === "\\/" ? prefix : `${prefix}${source}`;
      this.routes.push({
        ...route,
        pattern: new RegExp(`^${mounted}$`),
      });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(path);
      if (!match) continue;
      const params = Object.fromEntries(route.keys.map((key, index) => [key, match[index + 1]]));
      return route.handler(request, params);
    }
    return new Response("Not found", { status: 404 });
  }

  private add(method: string, path: string, handler: Handler) {
    const compiled = compilePath(path);
    this.routes.push({ method, ...compiled, handler });
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers
    }
  });
}
