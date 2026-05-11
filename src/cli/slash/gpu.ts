/**
 * /gpu — manage GPU compute: list types, check budget, view jobs
 *
 * Subcommands:
 *   list              — list available GPU types + pricing
 *   budget [amount]   — show or set monthly GPU budget (0 = unlimited)
 *   jobs              — list running/completed GPU jobs
 *   audit             — show recent GPU audit log entries
 */

import type { SlashCommand } from "./types.js";
import { listGPUJobs, totalGPUSpend, auditLog, getBudget, setBudget } from "../../gpu/jobs.js";

export const gpuSlashCommand: SlashCommand = {
  name: "gpu",
  description: "Manage GPU compute: list, budget, jobs, audit",
  async execute(args: string[], _ctx: any): Promise<string | undefined> {
    const sub = args[0] ?? "list";

    if (sub === "list") {
      const { gpuListTool } = await import("../../tools/gpu-compute.js");
      const result = await gpuListTool.execute({}, {} as any);
      return result.content;
    }

    if (sub === "budget") {
      if (args[1]) {
        const amt = parseFloat(args[1]);
        if (isNaN(amt) || amt < 0) return "Usage: /gpu budget <amount>  (0 = unlimited)";
        setBudget(amt);
        return amt === 0 ? "Budget cap removed. GPU spending is unlimited." : `Budget cap set to $${amt.toFixed(2)}.`;
      }
      const budget = getBudget();
      const spent = await totalGPUSpend();
      return budget === 0
        ? `No budget cap. Total GPU spend: $${spent.toFixed(2)}`
        : `Budget cap: $${budget.toFixed(2)}. Total GPU spend: $${spent.toFixed(2)}`;
    }

    if (sub === "jobs") {
      const jobs = await listGPUJobs();
      if (jobs.length === 0) return "No GPU jobs.";
      return jobs.map((j) =>
        `${j.status === "running" ? "🔄" : "✅"} [${j.id}] ${j.gpuType} on ${j.provider} — $${j.totalCost.toFixed(4)} (${j.status})`
      ).join("\n");
    }

    if (sub === "audit") {
      const entries = await auditLog(10);
      if (entries.length === 0) return "No audit entries.";
      return entries.map((e) => {
        try { const p = JSON.parse(e); return `${p.ts?.slice(0, 19) ?? "?"}  ${p.type}  ${p.job?.gpuType ?? p.jobId ?? ""}`; }
        catch { return e.slice(0, 100); }
      }).join("\n");
    }

    return `Subcommands: list, budget [amount], jobs, audit`;
  },
};
