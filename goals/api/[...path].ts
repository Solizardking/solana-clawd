export default async function handler(req: any, res: any) {
  const mod = await import("../dist/server.cjs");
  const appHandler = mod.default?.default ?? mod.default ?? mod;

  return appHandler(req, res);
}
