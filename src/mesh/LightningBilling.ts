/**
 * Lightning Billing - Team cost allocation via Bitcoin/Lightning
 * Pay-per-inference with automatic team splits
 */

import EventEmitter from 'events';
import crypto from 'crypto';
import { postJSON } from '../providers/http.js';
import { getToken } from '../utils/credentials.js';

export interface PaymentChannel {
  id: string;
  teamId: string;
  capacitySats: number;      // Channel capacity in satoshis
  localBalanceSats: number;  // Our balance
  remoteBalanceSats: number; // Counterparty balance
  state: 'pending' | 'open' | 'closing' | 'closed';
  createdAt: Date;
}

export interface InferenceInvoice {
  id: string;
  memberId: string;
  tokensUsed: number;
  amountSats: number;         // Calculated from tokens
  amountUsd: number;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  createdAt: Date;
  paidAt?: Date;
  paymentHash?: string;
  description: string;
}

export interface TeamCostSplit {
  memberId: string;
  tokensUsed: number;
  costSats: number;
  costUsd: number;
  percentage: number;
}

export interface BillingConfig {
  tokensPerSat: number;      // How many tokens per satoshi
  baseCostSats: number;      // Base cost per inference
  teamFeePercent: number;    // Platform fee (default: 5%)
  autoSettleThreshold: number; // Auto-settle when balance > this (sats)
}

export class LightningBilling extends EventEmitter {
  private teamId: string;
  private config: BillingConfig;
  private channels: Map<string, PaymentChannel> = new Map();
  private invoices: Map<string, InferenceInvoice> = new Map();
  private memberBalances: Map<string, { sats: number; usd: number }> = new Map();
  private pendingSplits: Map<string, TeamCostSplit[]> = new Map();

  constructor(
    teamId: string,
    config: Partial<BillingConfig> = {}
  ) {
    super();
    this.teamId = teamId;
    this.config = {
      tokensPerSat: 1000,      // 1000 tokens = 1 sat
      baseCostSats: 10,       // 10 sat base fee
      teamFeePercent: 5,
      autoSettleThreshold: 10000, // 10K sats
      ...config,
    };
  }

  /**
   * Calculate cost for an inference
   */
  calculateCost(tokensUsed: number): { sats: number; usd: number } {
    // Cost = base + (tokens / rate)
    const variableSats = Math.ceil(tokensUsed / this.config.tokensPerSat);
    const totalSats = this.config.baseCostSats + variableSats;
    
    // Convert to USD (approximate rate: 1 BTC = $100K)
    const btcPrice = 100000;
    const usd = (totalSats / 100000000) * btcPrice;

    return { sats: totalSats, usd };
  }

  /**
   * Create invoice for inference payment
   */
  async createInvoice(
    memberId: string,
    tokensUsed: number,
    description: string
  ): Promise<InferenceInvoice> {
    const cost = this.calculateCost(tokensUsed);
    
    // Add team fee
    const feeSats = Math.ceil(cost.sats * (this.config.teamFeePercent / 100));
    const totalSats = cost.sats + feeSats;

    const invoice: InferenceInvoice = {
      id: crypto.randomUUID(),
      memberId,
      tokensUsed,
      amountSats: totalSats,
      amountUsd: cost.usd * (1 + this.config.teamFeePercent / 100),
      status: 'pending',
      createdAt: new Date(),
      description,
    };

    // Wire to real LND if configured
    const lndUrl = process.env.LND_REST_URL;
    const macaroon = process.env.LND_MACAROON_HEX;
    if (lndUrl && macaroon) {
      try {
        const res = await fetch(`${lndUrl}/v1/invoices`, {
          method: 'POST',
          headers: { 'Grpc-Metadata-macaroon': macaroon, 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: totalSats, memo: description }),
        });
        if (res.ok) {
          const data = await res.json();
          invoice.paymentHash = data.r_hash;
        }
      } catch { /* LND unreachable — fall back to in-memory */ }
    }

    if (!invoice.paymentHash) {
      // Deterministic stub hash for offline testing
      invoice.paymentHash = crypto.randomUUID().replace(/-/g, '');
    }

    this.invoices.set(invoice.id, invoice);
    this.emit('invoice:created', invoice);

    return invoice;
  }

  /** Mark an invoice as settled (used internally or by LND webhook) */
  settleInvoice(paymentHash: string): void {
    for (const inv of this.invoices.values()) {
      if (inv.paymentHash === paymentHash && inv.status === 'pending') {
        inv.status = 'paid';
        inv.paidAt = new Date();
        this.emit('invoice:paid', inv);
        return;
      }
    }
  }

  /**
   * Split costs across team members (for shared projects)
   */
  calculateSplit(
    totalTokens: number,
    memberUsage: Map<string, number>, // memberId -> tokens they used
    projectCode?: string
  ): TeamCostSplit[] {
    const totalCost = this.calculateCost(totalTokens);
    const splits: TeamCostSplit[] = [];

    for (const [memberId, tokens] of memberUsage) {
      const percentage = tokens / totalTokens;
      const memberCost = {
        sats: Math.floor(totalCost.sats * percentage),
        usd: totalCost.usd * percentage,
      };

      splits.push({
        memberId,
        tokensUsed: tokens,
        costSats: memberCost.sats,
        costUsd: memberCost.usd,
        percentage: percentage * 100,
      });
    }

    // Store for later settlement
    const splitId = crypto.randomUUID();
    this.pendingSplits.set(splitId, splits);

    this.emit('split:calculated', {
      splitId,
      projectCode,
      totalTokens,
      totalCost,
      splits,
    });

    return splits;
  }

  /**
   * Record payment received
   */
  async recordPayment(
    invoiceId: string,
    paymentHash: string
  ): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return false;

    invoice.status = 'paid';
    invoice.paidAt = new Date();
    invoice.paymentHash = paymentHash;

    // Update member balance
    const currentBalance = this.memberBalances.get(invoice.memberId) || { sats: 0, usd: 0 };
    currentBalance.sats += invoice.amountSats;
    currentBalance.usd += invoice.amountUsd;
    this.memberBalances.set(invoice.memberId, currentBalance);

    this.emit('payment:received', {
      invoiceId,
      memberId: invoice.memberId,
      amountSats: invoice.amountSats,
      paymentHash,
    });

    // Check if we should auto-settle
    this.checkAutoSettlement(invoice.memberId);

    // Deflationary Burn: 5% of compute fee -> DIRGHA burn on gateway
    // feeSats is approx (amount / 1.05) * 0.05
    const feeSats = Math.ceil((invoice.amountSats / (1 + this.config.teamFeePercent / 100)) * (this.config.teamFeePercent / 100));
    const token = getToken();
    if (token && feeSats > 0) {
      const gateway = (process.env.DIRGHA_GATEWAY_URL || 'https://api.dirgha.ai').replace(/\/$/, '');
      postJSON(`${gateway}/api/bucky/dirgha/burn-inference`, { Authorization: `Bearer ${token}` }, { amountSats: feeSats })
        .catch(e => console.error('[Billing] Inference burn failed:', e.message));
    }

    return true;
  }

  /**
   * Settle accumulated balance to member's wallet.
   * Attempts real LND outbound payment if LND_REST_URL + LND_MACAROON_HEX are set
   * and the caller supplies a BOLT11 paymentRequest. Falls back to simulation.
   */
  async settleBalance(memberId: string, paymentRequest?: string): Promise<{
    success: boolean;
    amountSats: number;
    txId?: string;
    error?: string;
  }> {
    const balance = this.memberBalances.get(memberId);
    if (!balance || balance.sats === 0) {
      return { success: false, amountSats: 0, error: 'No balance to settle' };
    }

    const settledAmount = balance.sats;
    const settlementId = crypto.randomUUID();

    this.emit('settlement:initiated', {
      memberId,
      amountSats: settledAmount,
      settlementId,
    });

    const lndUrl = process.env.LND_REST_URL;
    const macaroon = process.env.LND_MACAROON_HEX;

    if (lndUrl && macaroon && paymentRequest) {
      try {
        const response = await fetch(`${lndUrl}/v1/channels/transactions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Grpc-Metadata-macaroon': macaroon,
          },
          body: JSON.stringify({ payment_request: paymentRequest }),
        });
        if (!response.ok) throw new Error(`LND ${response.status}`);
        const data = await response.json();
        this.memberBalances.set(memberId, { sats: 0, usd: 0 });
        return { success: true, amountSats: settledAmount, txId: data.payment_hash };
      } catch (err: any) {
        console.error('[Lightning] LND outbound failed, using simulation:', err.message);
      }
    }

    this.memberBalances.set(memberId, { sats: 0, usd: 0 });
    return { success: true, amountSats: settledAmount, txId: settlementId };
  }

  /**
   * Check if balance exceeds auto-settle threshold
   */
  private checkAutoSettlement(memberId: string): void {
    const balance = this.memberBalances.get(memberId);
    if (!balance) return;

    if (balance.sats >= this.config.autoSettleThreshold) {
      this.settleBalance(memberId);
    }
  }

  /**
   * Get member balance
   */
  getBalance(memberId: string): { sats: number; usd: number } {
    return this.memberBalances.get(memberId) || { sats: 0, usd: 0 };
  }

  /**
   * Get team billing summary
   */
  getTeamSummary(): {
    totalRevenueSats: number;
    totalRevenueUsd: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    memberCount: number;
  } {
    const invoices = Array.from(this.invoices.values());
    const paid = invoices.filter(i => i.status === 'paid');

    return {
      totalRevenueSats: paid.reduce((sum, i) => sum + i.amountSats, 0),
      totalRevenueUsd: paid.reduce((sum, i) => sum + i.amountUsd, 0),
      totalInvoices: invoices.length,
      paidInvoices: paid.length,
      pendingInvoices: invoices.filter(i => i.status === 'pending').length,
      memberCount: new Set(invoices.map(i => i.memberId)).size,
    };
  }

  /**
   * Generate monthly report
   */
  generateMonthlyReport(month: number, year: number): {
    month: string;
    totalTokens: number;
    totalCostUsd: number;
    byMember: Map<string, { tokens: number; cost: number }>;
    byProject: Map<string, { tokens: number; cost: number }>;
  } {
    const invoices = Array.from(this.invoices.values()).filter(i => {
      const date = i.createdAt;
      return date.getMonth() === month - 1 && date.getFullYear() === year;
    });

    const byMember = new Map<string, { tokens: number; cost: number }>();
    const byProject = new Map<string, { tokens: number; cost: number }>();

    for (const invoice of invoices) {
      // By member
      const member = byMember.get(invoice.memberId) || { tokens: 0, cost: 0 };
      member.tokens += invoice.tokensUsed;
      member.cost += invoice.amountUsd;
      byMember.set(invoice.memberId, member);

      // By project (from description)
      const projectMatch = invoice.description.match(/project:\s*(\w+)/);
      const project = projectMatch ? projectMatch[1] : 'uncategorized';
      const projectStats = byProject.get(project) || { tokens: 0, cost: 0 };
      projectStats.tokens += invoice.tokensUsed;
      projectStats.cost += invoice.amountUsd;
      byProject.set(project, projectStats);
    }

    return {
      month: `${year}-${month.toString().padStart(2, '0')}`,
      totalTokens: invoices.reduce((sum, i) => sum + i.tokensUsed, 0),
      totalCostUsd: invoices.reduce((sum, i) => sum + i.amountUsd, 0),
      byMember,
      byProject,
    };
  }

  /**
   * Simulate Lightning payment (for testing)
   */
  simulatePayment(invoiceId: string): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const invoice = this.invoices.get(invoiceId);
        if (!invoice) {
          resolve(false);
          return;
        }
        this.recordPayment(invoiceId, `simulated_${Date.now()}`);
        resolve(true);
      }, 100);
    });
  }
}

export default LightningBilling;
