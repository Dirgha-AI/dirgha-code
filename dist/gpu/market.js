/**
 * gpu/market.ts — GPU marketplace tools that interact with the
 * Abundance protocol (Bucky marketplace on api.dirgha.ai).
 *
 * Users can list GPU compute for rent, find GPU compute from others,
 * and settle payments via the existing escrow system.
 */
import { loadToken } from "../integrations/device-auth.js";
const GATEWAY = "https://api.dirgha.ai";
async function apiFetch(path, options = {}) {
    const token = await loadToken().catch(() => null);
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    };
    if (token?.token)
        headers["Authorization"] = `Bearer ${token.token}`;
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
export async function postGPUListing(listing) {
    const data = await apiFetch("/api/bucky/listings", {
        method: "POST",
        body: JSON.stringify({
            title: `${listing.gpuType} GPU compute`,
            description: `${listing.gpuType} - ${listing.vramGb}GB VRAM - $${listing.pricePerHr}/hr`,
            category: "compute",
            price: listing.pricePerHr,
            currency: "USD",
            metadata: { gpuType: listing.gpuType, vramGb: listing.vramGb, provider: listing.provider, region: listing.region },
        }),
    });
    return data;
}
export async function listGPUListings(minVramGb, maxPrice) {
    // Server-side filter: only fetch GPU compute listings
    const data = await apiFetch("/api/bucky/listings?type=compute");
    const listings = Array.isArray(data) ? data : data.listings ?? data.data ?? [];
    return listings
        .map((l) => ({
        id: l.id,
        gpuType: parseGpuType(l),
        vramGb: parseVram(l),
        pricePerHr: l.price_usd ?? l.price ?? 0,
        provider: l.seller_id ?? "self",
        region: parseRegion(l),
        available: l.is_public !== false, // backend uses is_public boolean, not status
        createdBy: l.seller_id,
    }))
        .filter((l) => {
        if (minVramGb && l.vramGb < minVramGb)
            return false;
        if (maxPrice && l.pricePerHr > maxPrice)
            return false;
        return l.available;
    });
}
/** Extract GPU model from listing name, description, or tags. */
function parseGpuType(l) {
    // Check name/description for known GPU patterns
    const text = `${l.name ?? ""} ${l.title ?? ""} ${l.description ?? ""}`.toUpperCase();
    const match = text.match(/\b(A100|H100|RTX\s*\d{3,4}|V100|T4|L40S?|A6000|MI\d{3}X?)\b/i);
    if (match)
        return match[1].replace(/\s+/, " ");
    return l.name ?? l.title ?? "unknown";
}
/** Extract VRAM from description or content metadata. */
function parseVram(l) {
    const text = `${l.name ?? ""} ${l.description ?? ""}`;
    const match = text.match(/(\d+)\s*GB\s*(?:VRAM|vram)/i);
    if (match)
        return parseInt(match[1], 10);
    if (l.content?.vram_gb)
        return Number(l.content.vram_gb);
    return 0;
}
/** Extract region from listing description or content metadata. */
function parseRegion(l) {
    if (l.content?.location)
        return l.content.location;
    const text = l.description ?? "";
    const match = text.match(/\b(Mumbai|Delhi|Bangalore|Singapore|Frankfurt|London|NYC|US-?East|US-?West|EU)\b/i);
    return match ? match[1] : undefined;
}
export async function postGPUJob(job) {
    const data = await apiFetch("/api/bucky/jobs", {
        method: "POST",
        body: JSON.stringify({
            listing_id: job.listingId,
            title: `GPU job: ${job.gpuType}`,
            description: `GPU compute: ${job.gpuType} for ${job.durationHrs}h`,
            budget_sats: 0,
            metadata: { gpuType: job.gpuType, durationHrs: job.durationHrs, totalCost: job.totalCost },
        }),
    });
    return data;
}
export async function getGPUJobStatus(jobId) {
    const data = await apiFetch(`/api/bucky/jobs/${jobId}`);
    return {
        id: data.id,
        gpuType: data.metadata?.gpuType ?? "unknown",
        listingId: data.listing_id ?? "",
        durationHrs: data.metadata?.durationHrs ?? 0,
        totalCost: data.metadata?.totalCost ?? data.budget_sats ?? 0,
        status: data.status === "active" || data.status === "open" ? "running" : data.status,
    };
}
export async function settleGPUJob(jobId) {
    await apiFetch(`/api/bucky/jobs/${jobId}/settle`, { method: "POST" });
}
//# sourceMappingURL=market.js.map