/**
 * gpu/market.ts — GPU marketplace tools that interact with the
 * Abundance protocol (Bucky marketplace on api.dirgha.ai).
 *
 * Users can list GPU compute for rent, find GPU compute from others,
 * and settle payments via the existing escrow system.
 */

import { loadToken } from "../integrations/device-auth.js";

const GATEWAY = "https://api.dirgha.ai";

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await loadToken().catch(() => null);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token?.token) headers["Authorization"] = `Bearer ${token.token}`;

  const res = await fetch(`${GATEWAY}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Gateway ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export interface GPUListing {
  id?: string;
  gpuType: string;
  vramGb: number;
  pricePerHr: number;     // USD
  provider: string;       // "runpod" | "spheron" | "akash" | "self" (user's own GPU)
  region?: string;
  available: boolean;
  createdBy?: string;
}

export async function postGPUListing(listing: GPUListing): Promise<GPUListing> {
  const data = await apiFetch("/api/bucky/listings", {
    method: "POST",
    body: JSON.stringify({
      title: `${listing.gpuType} GPU compute`,
      description: `${listing.gpuType} - ${listing.vramGb}GB VRAM - $${listing.pricePerHr}/hr`,
      category: "gpu-compute",
      price: listing.pricePerHr,
      currency: "USD",
      metadata: { gpuType: listing.gpuType, vramGb: listing.vramGb, provider: listing.provider, region: listing.region },
    }),
  });
  return data;
}

export async function listGPUListings(minVramGb?: number, maxPrice?: number): Promise<GPUListing[]> {
  const data = await apiFetch("/api/bucky/listings");
  const listings = Array.isArray(data) ? data : data.listings ?? data.data ?? [];
  return listings
    .filter((l: any) => l.category === "gpu-compute" || l.metadata?.gpuType)
    .map((l: any) => ({
      id: l.id,
      gpuType: l.metadata?.gpuType ?? l.title ?? "unknown",
      vramGb: l.metadata?.vramGb ?? 0,
      pricePerHr: l.price ?? 0,
      provider: l.metadata?.provider ?? "self",
      region: l.metadata?.region,
      available: l.status === "active",
      createdBy: l.createdBy,
    }))
    .filter((l: GPUListing) => {
      if (minVramGb && l.vramGb < minVramGb) return false;
      if (maxPrice && l.pricePerHr > maxPrice) return false;
      return l.available;
    });
}

export interface GPUJob {
  id?: string;
  gpuType: string;
  listingId: string;
  durationHrs: number;
  totalCost: number;
  status: "pending" | "running" | "completed" | "disputed";
}

export async function postGPUJob(job: Omit<GPUJob, "id" | "status">): Promise<GPUJob> {
  const data = await apiFetch("/api/bucky/jobs", {
    method: "POST",
    body: JSON.stringify({
      listingId: job.listingId,
      title: `GPU job: ${job.gpuType}`,
      description: `GPU compute: ${job.gpuType} for ${job.durationHrs}h`,
      budget: job.totalCost,
      currency: "USD",
      metadata: { gpuType: job.gpuType, durationHrs: job.durationHrs },
    }),
  });
  return data;
}

export async function getGPUJobStatus(jobId: string): Promise<GPUJob> {
  const data = await apiFetch(`/api/bucky/jobs/${jobId}`);
  return {
    id: data.id,
    gpuType: data.metadata?.gpuType ?? "unknown",
    listingId: data.listingId ?? "",
    durationHrs: data.metadata?.durationHrs ?? 0,
    totalCost: data.budget ?? 0,
    status: data.status === "active" ? "running" : data.status,
  };
}

export async function settleGPUJob(jobId: string): Promise<void> {
  await apiFetch(`/api/bucky/jobs/${jobId}/settle`, { method: "POST" });
}
