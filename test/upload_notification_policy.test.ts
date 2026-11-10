import assert from "node:assert/strict";
import test from "node:test";
import { decideAssetNotification } from "../src/upload_notification_policy.ts";

test("keeps patient notification gated until storage confirms the asset", () => {
  assert.deepEqual(decideAssetNotification(false), {
    audience: "staff_only",
    appointmentState: "awaiting_asset",
  });
  assert.deepEqual(decideAssetNotification(true), {
    audience: "patient_ready",
    appointmentState: "asset_received",
  });
});
