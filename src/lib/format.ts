/** An amount in dinars: "4,900 DA". */
export function formatDA(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} DA`;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  shipped: "Shipped",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned",
};

export const ROLE_LABELS: Record<string, string> = {
  none: "No role",
  confirmer: "Confirmer",
  shipper: "Shipper",
};

/** Digits only, so "0550 12 34 56" and "0550123456" are one customer. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Algiers",
  });
}
