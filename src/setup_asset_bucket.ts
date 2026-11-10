import { infrai } from "./infrai_storage.ts";

const bucket = process.env.ASSET_BUCKET ?? "appointment-assets";
await infrai.storage.bucket.create(bucket);
console.log(JSON.stringify({ ok: true, bucket }));
