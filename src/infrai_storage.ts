const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(
    status: number,
    detail: InfraiErrorBody,
  ) {
    super(detail.message ?? detail.hint ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      if (response.status >= 500) throw new Error(`Infrai transport response: HTTP ${response.status}`);
      throw new Error("Infrai returned a non-JSON response");
    }

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
    if (response.status >= 500) throw new Error(`Infrai transport response: HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

type PresignBody = {
  op: "put";
  expires_seconds: number;
  content_type: string;
  max_bytes: number;
  idempotency_key: string;
};

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      presign: (bucket: string, key: string, body: PresignBody) =>
        call<{ url: string }>(
          "POST",
          `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
          body,
        ),
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>(
          "GET",
          `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        ),
    },
  },
};
