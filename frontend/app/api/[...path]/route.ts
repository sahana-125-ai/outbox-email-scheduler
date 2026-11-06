import type { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: { path: string[] } };

async function handler(request: NextRequest, context: Context) {
  return proxyRequest(request, "/api", context.params.path ?? []);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS
};
