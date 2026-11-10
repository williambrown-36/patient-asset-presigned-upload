export type NotificationDecision = {
  audience: "staff_only" | "patient_ready";
  appointmentState: "awaiting_asset" | "asset_received";
};

export function decideAssetNotification(objectFound: boolean): NotificationDecision {
  return objectFound
    ? { audience: "patient_ready", appointmentState: "asset_received" }
    : { audience: "staff_only", appointmentState: "awaiting_asset" };
}
