import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  deleteBucketFile,
  getBucketInfo,
  listBucketTree,
  listBuckets,
} from "./huggingface";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const bucketIdSchema = z.string().regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/);
const bucketPathSchema = z.string().min(1).max(1024).refine(path => !path.startsWith("/") && !path.includes("\0"));

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  buckets: router({
    list: protectedProcedure.query(() => listBuckets()),
    info: protectedProcedure
      .input(z.object({ bucketId: bucketIdSchema }))
      .query(({ input }) => getBucketInfo(input.bucketId)),
    tree: protectedProcedure
      .input(z.object({ bucketId: bucketIdSchema, prefix: z.string().max(1024).optional() }))
      .query(({ input }) => listBucketTree(input.bucketId, input.prefix)),
    deleteFile: protectedProcedure
      .input(z.object({ bucketId: bucketIdSchema, path: bucketPathSchema }))
      .mutation(async ({ input }) => {
        await deleteBucketFile(input.bucketId, input.path);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
