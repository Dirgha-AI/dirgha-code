/**
 * cost/BudgetEnforcer.ts — Hard daily budget limits with emergency reserve
 * Prevents overspend with automatic tier downgrade on budget pressure
 */

export interface BudgetConfig {
  dailyLimit: number;      // $20 target (was $200)
  emergencyReserve: number; // 10% buffer for critical tasks
  resetHour: number;       // UTC hour for daily reset (default 0)
}

export interface BudgetStatus {
  spent: number;
  remaining: number;
  dailyLimit: number;
  emergencyAvailable: boolean;
  utilizationPercent: number;
}

export class BudgetEnforcer {
  private spent = 0;
  private lastReset: string;
  private config: BudgetConfig;

  constructor(config: BudgetConfig = { dailyLimit: 20, emergencyReserve: 2, resetHour: 0 }) {
    this.config = config;
    this.lastReset = this.getTodayKey();
  }

  private getTodayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  }

  private checkReset(): void {
    const today = this.getTodayKey();
    if (today !== this.lastReset) {
      this.spent = 0;
      this.lastReset = today;
    }
  }

  canSpend(amount: number, isCritical = false): boolean {
    this.checkReset();
    const effectiveLimit = isCritical
      ? this.config.dailyLimit + this.config.emergencyReserve
      : this.config.dailyLimit;
    return this.spent + amount <= effectiveLimit;
  }

  spend(amount: number, isCritical = false): boolean {
    this.checkReset();
    const effectiveLimit = isCritical
      ? this.config.dailyLimit + this.config.emergencyReserve
      : this.config.dailyLimit;

    if (this.spent + amount > effectiveLimit) {
      return false; // Budget exhausted
    }

    this.spent += amount;
    return true;
  }

  getStatus(): BudgetStatus {
    this.checkReset();
    return {
      spent: this.spent,
      remaining: this.config.dailyLimit - this.spent,
      dailyLimit: this.config.dailyLimit,
      emergencyAvailable: this.spent < this.config.dailyLimit + this.config.emergencyReserve,
      utilizationPercent: (this.spent / this.config.dailyLimit) * 100,
    };
  }

  shouldDowngrade(): boolean {
    const status = this.getStatus();
    return status.utilizationPercent > 80; // Downgrade at 80% spend
  }

  getRemaining(): number {
    return this.getStatus().remaining;
  }
}
