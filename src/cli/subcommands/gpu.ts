/**
 * dirgha gpu — GPU compute subcommand
 *
 * Usage:
 *   dirgha gpu list                    List available GPU types + prices
 *   dirgha gpu status <instance-id>    Check running instance
 *   dirgha gpu destroy <instance-id>   Terminate instance
 *   dirgha gpu jobs                    Show GPU job history
 *   dirgha gpu budget [amount]         Show/set monthly budget
 *   dirgha gpu audit                   Show audit log
 *   dirgha gpu market list             Browse marketplace listings
 *   dirgha gpu market post <gpu> <price>  List GPU on marketplace
 */

import type { Subcommand } from "./index.js";
import { listGPUJobs, totalGPUSpend, auditLog, getBudget } from "../gpu/jobs.js";
import { listGPUListings, postGPUListing } from "../gpu/market.js";
import { RunPodProvider } from "../gpu/runpod.js";
import { SpheronProvider } from "../gpu/spheron.js";
import { AkashProvider } from "../gpu/akash.js";

function getAllProviders() {
  return [new RunPodProvider(), new SpheronProvider(), new AkashProvider()];
}

export const gpuSubcommand: Subcommand = {
  name: "gpu",
  description: "GPU compute: list, provision, monitor, marketplace",
  async run(argv: string[], _ctx: any): Promise<number> {
    const sub = argv[0] || "list";

    if (sub === "list") {
      const all = getAllProviders();
      const results = await Promise.all(
        all.map(async (p) => {
          try { return await p.listGPUTypes(); } catch { return []; }
        }),
      );
      const gpus = results.flat().sort((a, b) => a.costPerHr - b.costPerHr);
      if (gpus.length === 0) { console.log("No GPUs available."); return 1; }
      console.log(`\nAvailable GPUs (${gpus.length}):`);
      console.log("  PROVIDER  GPU                          VRAM    PRICE");
      for (const g of gpus) {
        console.log(`  ${g.provider.padEnd(8)} ${g.name.padEnd(28)} ${String(g.vramGb).padStart(3)}GB  $${g.costPerHr.toFixed(2)}/hr`);
      }
      const c = gpus[0];
      console.log(`\n  Cheapest: ${c.name} at $${c.costPerHr.toFixed(2)}/hr on ${c.provider}`);
      return 0;
    }

    if (sub === "status" || sub === "s") {
      const id = argv[1];
      if (!id) { console.log("Usage: dirgha gpu status <instance-id>"); return 1; }
      for (const p of getAllProviders()) {
        try {
          const s = await p.getStatus(id);
          const elapsed = ((Date.now() - new Date(s.startedAt).getTime()) / 3600000).toFixed(2);
          console.log(`\nInstance: ${id.slice(0, 12)}`);
          console.log(`  Status:    ${s.status}`);
          console.log(`  Uptime:    ${elapsed}h`);
          console.log(`  Cost:      $${s.totalCost.toFixed(4)} ($${s.costPerHr.toFixed(2)}/hr)`);
          console.log(`  Provider:  ${s.provider}`);
          console.log(`  IP:        ${s.ipAddress ?? "N/A"}`);
          return 0;
        } catch {}
      }
      console.log("Instance not found on any provider.");
      return 1;
    }

    if (sub === "destroy" || sub === "d") {
      const id = argv[1];
      if (!id) { console.log("Usage: dirgha gpu destroy <instance-id>"); return 1; }
      for (const p of getAllProviders()) {
        try {
          const s = await p.getStatus(id);
          await p.destroy(id);
          console.log(`\n✅ Instance ${id.slice(0, 12)} destroyed. Total cost: $${s.totalCost.toFixed(4)}`);
          return 0;
        } catch {}
      }
      console.log("Instance not found.");
      return 1;
    }

    if (sub === "jobs" || sub === "j") {
      const jobs = await listGPUJobs();
      if (jobs.length === 0) { console.log("No GPU jobs."); return 0; }
      console.log(`\nGPU Jobs (${jobs.length}):`);
      for (const j of jobs) {
        const icon = j.status === "running" ? "🔄" : j.status === "completed" ? "✅" : "❌";
        const elapsed = j.completedAt
          ? ((new Date(j.completedAt).getTime() - new Date(j.startedAt).getTime()) / 3600000).toFixed(2)
          : ((Date.now() - new Date(j.startedAt).getTime()) / 3600000).toFixed(2);
        console.log(`  ${icon} [${j.id}] ${j.gpuType} on ${j.provider} — $${j.totalCost.toFixed(4)} (${elapsed}h)`);
      }
      const total = await totalGPUSpend();
      console.log(`\n  Total GPU spend: $${total.toFixed(2)}`);
      return 0;
    }

    if (sub === "budget" || sub === "b") {
      if (argv[1]) {
        const amt = parseFloat(argv[1]);
        if (isNaN(amt) || amt < 0) { console.log("Usage: dirgha gpu budget <amount> (0 = unlimited)"); return 1; }
        const { setBudget } = await import("../gpu/jobs.js");
        setBudget(amt);
        console.log(amt === 0 ? "Budget cap removed." : `Budget cap set to $${amt.toFixed(2)}.`);
        return 0;
      }
      const budget = getBudget();
      const spent = await totalGPUSpend();
      console.log(budget === 0
        ? `No budget cap. Total spend: $${spent.toFixed(2)}`
        : `Budget: $${budget.toFixed(2)}. Total spend: $${spent.toFixed(2)}`);
      return 0;
    }

    if (sub === "audit") {
      const entries = await auditLog(15);
      if (entries.length === 0) { console.log("No audit entries."); return 0; }
      console.log("\nRecent GPU audit log:");
      for (const e of entries) {
        try { const p = JSON.parse(e); console.log(`  ${(p.ts ?? "").slice(0, 19)}  ${p.type}  ${p.job?.gpuType ?? p.jobId ?? ""}`); }
        catch { console.log(`  ${e.slice(0, 100)}`); }
      }
      return 0;
    }

    if (sub === "market") {
      const marketSub = argv[1] || "list";
      if (marketSub === "list" || marketSub === "ls") {
        const listings = await listGPUListings();
        if (listings.length === 0) { console.log("No marketplace listings."); return 0; }
        console.log(`\nMarketplace GPU listings (${listings.length}):`);
        for (const l of listings) {
          console.log(`  ${l.gpuType.padEnd(28)} ${String(l.vramGb).padStart(3)}GB  $${l.pricePerHr.toFixed(2)}/hr  ${l.provider}`);
        }
        return 0;
      }
      if (marketSub === "post") {
        const gpuType = argv[2];
        const price = parseFloat(argv[3] || "0");
        if (!gpuType || !price) { console.log("Usage: dirgha gpu market post <gpu-type> <price-per-hr>"); return 1; }
        await postGPUListing({ gpuType, vramGb: 24, pricePerHr: price, provider: "self", available: true });
        console.log(`\n✅ Listed: ${gpuType} at $${price.toFixed(2)}/hr`);
        return 0;
      }
    }

    console.log(`\nUsage: dirgha gpu <command>

Commands:
  list                    List GPU types + prices
  status <id>             Check instance status
  destroy <id>            Terminate instance
  jobs                    Show job history
  budget [amount]         Show/set monthly budget
  audit                   Show audit log
  market list             Browse marketplace
  market post <gpu> <$>   List GPU on marketplace`);
    return 1;
  },
};
