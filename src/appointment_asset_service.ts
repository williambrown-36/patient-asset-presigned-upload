import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai_storage.ts";
import { decideAssetNotification } from "./upload_notification_policy.ts";

const bucket = process.env.ASSET_BUCKET ?? "appointment-assets";
const port = Number(process.env.PORT ?? "3000");

const uploadRequest = z.object({
  appointmentId: z.string().uuid(),
  assetKind: z.enum(["care-plan", "lab-result", "consent-form"]),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

const confirmationRequest = z.object({
  appointmentId: z.string().uuid(),
  objectKey: z.string().regex(/^appointments\/[0-9a-f-]+\/(care-plan|lab-result|consent-form)\/[0-9a-f-]+$/),
});

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function clientErrorStatus(error: InfraiError): number {
  return error.status >= 400 && error.status < 500 ? error.status : 502;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/appointment-assets/upload-intent") {
      const input = uploadRequest.parse(await readJson(request));
      const objectKey = `appointments/${input.appointmentId}/${input.assetKind}/${randomUUID()}`;
      const signed = await infrai.storage.object.presign(bucket, objectKey, {
        op: "put",
        expires_seconds: 300,
        content_type: input.contentType,
        max_bytes: input.bytes,
        idempotency_key: randomUUID(),
      });
      json(response, 201, {
        uploadUrl: signed.url,
        method: "PUT",
        objectKey,
        notification: decideAssetNotification(false),
      });
      return;
    }

    if (request.method === "POST" && request.url === "/appointment-assets/confirm") {
      const input = confirmationRequest.parse(await readJson(request));
      if (!input.objectKey.startsWith(`appointments/${input.appointmentId}/`)) {
        json(response, 400, { error: "objectKey does not belong to appointmentId" });
        return;
      }
      const object = await infrai.storage.object.head(bucket, input.objectKey);
      json(response, 200, {
        objectKey: input.objectKey,
        notification: decideAssetNotification(object.found),
      });
      return;
    }

    json(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      json(response, 400, { error: "invalid request", issues: error.issues });
    } else if (error instanceof InfraiError) {
      json(response, clientErrorStatus(error), { error: error.detail });
    } else {
      json(response, 500, { error: "request failed" });
    }
  }
});

server.listen(port, () => {
  console.log(`Appointment asset service listening on http://localhost:${port}`);
});
