const HF_ENDPOINT = "https://huggingface.co";
export const DEFAULT_BUCKET_ID = "155422li/manus";

export type HuggingFaceBucket = {
  _id?: string;
  id: string;
  author?: string;
  private: boolean;
  createdAt?: string;
  updatedAt?: string;
  size: number;
  totalFiles: number;
  repoType?: "bucket";
  cdnRegions?: string[];
};

export type HuggingFaceBucketEntry = {
  type: "file" | "directory";
  path: string;
  size?: number;
  xetHash?: string;
  uploadedAt?: string;
};

export function getHuggingFaceToken() {
  const token = process.env.HF_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HF_ACCESS_TOKEN is not configured on the server");
  }
  return token;
}

function assertBucketId(bucketId: string) {
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(bucketId)) {
    throw new Error("Invalid bucket id");
  }
}

function assertBucketPath(path: string) {
  if (!path || path.length > 1024 || path.includes("\0") || path.startsWith("/")) {
    throw new Error("Invalid bucket file path");
  }
}

async function hfFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${HF_ENDPOINT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getHuggingFaceToken()}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hugging Face API ${response.status}: ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

export async function listBuckets() {
  return hfFetch<HuggingFaceBucket[]>("/api/buckets/me");
}

export async function getBucketInfo(bucketId: string) {
  assertBucketId(bucketId);
  return hfFetch<HuggingFaceBucket>(`/api/buckets/${encodeURIComponent(bucketId).replace("%2F", "/")}`);
}

export async function listBucketTree(bucketId: string, prefix?: string) {
  assertBucketId(bucketId);
  const search = new URLSearchParams({ recursive: "true" });
  const encodedPrefix = prefix ? `/${encodeURIComponent(prefix)}` : "";
  if (prefix) assertBucketPath(prefix);
  return hfFetch<HuggingFaceBucketEntry[]>(
    `/api/buckets/${encodeURIComponent(bucketId).replace("%2F", "/")}/tree${encodedPrefix}?${search.toString()}`
  );
}

export async function deleteBucketFile(bucketId: string, path: string) {
  assertBucketId(bucketId);
  assertBucketPath(path);
  const response = await fetch(
    `${HF_ENDPOINT}/api/buckets/${encodeURIComponent(bucketId).replace("%2F", "/")}/batch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getHuggingFaceToken()}`,
        "Content-Type": "application/x-ndjson",
        Accept: "application/json",
      },
      body: `${JSON.stringify({ type: "deleteFile", path })}\n`,
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Hugging Face API ${response.status}: ${detail.slice(0, 300)}`);
  }
}

export function getBucketFileUrl(bucketId: string, path: string) {
  assertBucketId(bucketId);
  assertBucketPath(path);
  const encodedBucket = encodeURIComponent(bucketId).replace("%2F", "/");
  return `${HF_ENDPOINT}/buckets/${encodedBucket}/resolve/${encodeURIComponent(path)}`;
}

export function getMediaKind(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm", "mov", "m4v", "mkv", "avi", "mpeg", "mpg"].includes(extension)) return "video" as const;
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(extension)) return "image" as const;
  if (["mp3", "wav", "ogg", "m4a", "flac"].includes(extension)) return "audio" as const;
  if (["txt", "md", "json", "csv", "log", "yaml", "yml"].includes(extension)) return "text" as const;
  return "file" as const;
}
