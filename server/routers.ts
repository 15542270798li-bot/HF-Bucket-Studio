import { z } from "zod";
import { deleteBucketFile, getBucketInfo, listBucketTree, listBuckets } from "./huggingface";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, router } from "./_core/trpc";

const bucketIdSchema = z.string().regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/);
const bucketPathSchema = z.string().min(1).max(1024).refine(path => !path.startsWith("/") && !path.includes("\0"));

export const appRouter = router({
  system: systemRouter,
  buckets: router({
    list: protectedProcedure.query(() => listBuckets()),
    info: protectedProcedure.input(z.object({ bucketId: bucketIdSchema })).query(({ input }) => getBucketInfo(input.bucketId)),
    tree: protectedProcedure.input(z.object({ bucketId: bucketIdSchema, prefix: z.string().max(1024).optional() })).query(({ input }) => listBucketTree(input.bucketId, input.prefix)),
    deleteFile: protectedProcedure.input(z.object({ bucketId: bucketIdSchema, path: bucketPathSchema })).mutation(async ({ input }) => {
      await deleteBucketFile(input.bucketId, input.path);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
