import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { ACCESS_PRINCIPAL, isAccessGranted } from "../accessAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: typeof ACCESS_PRINCIPAL | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: isAccessGranted(opts.req) ? ACCESS_PRINCIPAL : null,
  };
}
