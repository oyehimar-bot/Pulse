export type PulseUser = {
  id: string;
  displayName: string | null;
  phone: string;
  pulseId: string;
};

export type DealStatus = "DRAFT" | "AWAITING_BUYER" | "AWAITING_PAYMENT" | "FUNDED" | "DELIVERED" | "RELEASED" | "DISPUTED" | "REFUNDED" | "EXPIRED";
export type PayoutStatus = "READY" | "PENDING" | "SUCCEEDED" | "FAILED";

export type DashboardDeal = {
  id: string;
  dealCode: string;
  description: string;
  amountKobo: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  releasedAt: string | null;
  role: "SELLER" | "BUYER";
  counterparty: string;
  license: { certificateNumber: string; sha256Hash: string; createdAt: string } | null;
  payout: { status: PayoutStatus; amountKobo: string } | null;
};

export type DashboardResponse = {
  user: PulseUser;
  summary: { activeDeals: number; completedDeals: number; totalDeals: number; totalValueKobo: string };
  deals: DashboardDeal[];
};

export type DealEvent = {
  id: string;
  type: string;
  fromStatus: DealStatus | null;
  toStatus: DealStatus | null;
  data: unknown;
  createdAt: string;
};

export type LedgerEntry = {
  id: string;
  account: string;
  direction: "CREDIT" | "DEBIT";
  amountKobo: string;
  reason: string;
  createdAt: string;
};

export type DealDetail = DashboardDeal & {
  buyerPhone: string | null;
  rightsText: string;
  items: unknown;
  seller: { displayName: string | null; pulseId: string };
  buyer: { displayName: string | null; pulseId: string } | null;
  events: DealEvent[];
  ledgerEntries: LedgerEntry[];
  messages: Array<{ id: string; direction: "INBOUND" | "OUTBOUND"; senderPhone: string; body: string; sentAt: string; deliveryError: string | null }>;
  payments: Array<{ id: string; status: string; amountKobo: string; createdAt: string; updatedAt: string }>;
  license: (NonNullable<DashboardDeal["license"]> & { verificationUrl: string; pdfUrl: string }) | null;
};

export type LicenseListItem = {
  certificateNumber: string;
  sha256Hash: string;
  createdAt: string;
  deal: { dealCode: string; description: string; rightsText: string; amountKobo: string };
  verificationUrl: string;
  pdfUrl: string;
};

export type LicenseVerification = {
  valid: boolean;
  certificateNumber?: string;
  sha256?: string;
  issuedAt?: string;
  license?: {
    dealCode: string;
    sellerName: string;
    buyerName: string;
    workDescription: string;
    rights: string;
    amountKobo: string;
    currency: string;
  };
  error?: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export async function apiRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, { credentials: "include", signal });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed with status ${response.status}.`);
  return body;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Request failed with status ${response.status}.`);
  return result;
}

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

export function formatMoney(kobo: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(Number(BigInt(kobo)) / 100);
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-GB", options).format(new Date(value));
}
