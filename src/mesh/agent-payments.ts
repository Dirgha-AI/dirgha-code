// @ts-nocheck
/**
 * Agent Payment Router
 * Automatic micropayments for agent work
 */

import { LightningBilling } from './LightningBilling';

export interface AgentInvoice {
  id: string;
  agentId: string;
  taskId: string;
  description: string;
  computeTimeSeconds: number;
  tokensGenerated: number;
  amountSats: number;
  status: 'pending' | 'paid' | 'disputed';
  createdAt: Date;
  paidAt?: Date;
}

export class AgentPaymentRouter {
  private invoices: Map<string, AgentInvoice> = new Map();

  constructor(private lightning: LightningBilling) {}

  async createInvoice(
    agentId: string,
    taskId: string,
    description: string,
    computeTime: number,
    tokens: number
  ): Promise<AgentInvoice> {
    const amount = Math.ceil(computeTime + tokens * 0.01);
    const invoice: AgentInvoice = {
      id: crypto.randomUUID(),
      agentId, taskId, description,
      computeTimeSeconds: computeTime,
      tokensGenerated: tokens,
      amountSats: amount,
      status: 'pending',
      createdAt: new Date(),
    };
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async payInvoice(invoiceId: string): Promise<boolean> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice || invoice.status !== 'pending') return false;
    
    const lnInvoice = await this.lightning.createInvoice(
      invoice.agentId, invoice.tokensGenerated, invoice.description
    );
    
    const paid = await this.awaitPayment(lnInvoice.paymentHash, 60000);
    if (paid) {
      invoice.status = 'paid';
      invoice.paidAt = new Date();
    }
    return paid;
  }

  private async awaitPayment(hash: string, timeoutMs: number): Promise<boolean> {
    const lndUrl = process.env.LND_REST_URL;
    const macaroon = process.env.LND_MACAROON_HEX;

    if (lndUrl && macaroon) {
      // Poll LND REST API for invoice settlement
      const deadline = Date.now() + timeoutMs;
      const pollMs = 2000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`${lndUrl}/v1/invoice/${hash}`, {
            headers: { 'Grpc-Metadata-macaroon': macaroon },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.state === 'SETTLED') return true;
            if (data.state === 'CANCELED') return false;
          }
        } catch { /* LND unreachable — keep polling */ }
        await new Promise(r => setTimeout(r, pollMs));
      }
      return false;
    }

    // Offline: listen for settleInvoice event
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.lightning.removeListener('invoice:paid', onPaid);
        resolve(false);
      }, timeoutMs);

      const onPaid = (inv: { paymentHash?: string }) => {
        if (inv.paymentHash === hash) {
          clearTimeout(timer);
          resolve(true);
        }
      };
      this.lightning.once('invoice:paid', onPaid);
    });
  }
}
