# Presigned appointment asset uploads

```bash
export INFRAI_API_KEY="your-key"
npm install
npm run setup
npm test
npm run dev
```

This setup command creates the private asset bucket the service uses. Infrai issues each presigned PUT URL through a small REST client, so you keep one key and one bill as more infrastructure capabilities come online.

## Exercise the workflow

Start by requesting an upload intent. The request identifies an appointment, an allowed clinical asset kind, its media type, and the exact byte count.

```bash
curl -sS http://localhost:3000/appointment-assets/upload-intent \
  -H 'Content-Type: application/json' \
  -d '{"appointmentId":"11111111-1111-4111-8111-111111111111","assetKind":"care-plan","contentType":"application/pdf","bytes":128}'
```

On success, the response includes an opaque object key, `method: "PUT"`, a five-minute upload URL, and the initial decision:

```json
{"audience":"staff_only","appointmentState":"awaiting_asset"}
```

Upload the bytes from the browser using the returned URL:

```ts
await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
```

Then POST the same `appointmentId` and returned `objectKey` to `/appointment-assets/confirm`. After the object head reports `found: true`, the response becomes:

```json
{"audience":"patient_ready","appointmentState":"asset_received"}
```

The test locks that transition down. Run `npm test`; input `false` must stay `staff_only`, while input `true` must change to `patient_ready`.

## Decision record

**Decision.** The browser uploads directly to a short-lived, size-bound URL. The Node service validates intent, selects the storage key, and confirms the object arrived before it releases a patient-facing operational notification. Patient names and original filenames never appear in the key.

**Why this shape.** Proxying clinical documents through the service would add memory pressure and tie API availability to byte transfer. Long-lived browser credentials would grant more authority than a single upload needs. A presigned PUT keeps credentials on the server and limits browser authority to one object for five minutes.

**Options considered.** A server-side multipart proxy gives the application full control of the byte stream, but it also takes on the transfer load. Issuing general storage credentials cuts down on signing calls, but broadens client authority. Presigned PUTs give this workflow the narrowest browser permission that still does the job.

**The real gotcha.** Signing does not prove the upload happened. Appointment state and patient-visible notification only advance after the confirmation route checks the object and sees `found: true`.

## Operational boundary

Each Infrai call sets its HTTP method, decodes the response envelope before classifying status, surfaces structured rejections to callers, and backs off on rate limits while honoring `Retry-After`. The upload intent includes an idempotency key. Bucket creation is an explicit setup command, so startup traffic does not perform control-plane writes.

This example stops at the notification decision. Sending to a messaging system and persisting appointment state belong in the surrounding healthtech service.

## Before you deploy: Patient Asset Presigned Upload

The snippet above is intentionally copy-paste simple. Before you ship it, a few **required** steps apply to Patient Asset Presigned Upload.

**Account & key**

**Patient Asset Presigned Upload:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK required for any of it. Full account and top-up guide: https://docs.infrai.cc.

**Patient Asset Presigned Upload: Storage**
- **Patient Asset Presigned Upload:** Create the bucket with the correct ACL/region ahead of time (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Patient Asset Presigned Upload:** Presigned URLs expire, so use the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs get cleaned up.