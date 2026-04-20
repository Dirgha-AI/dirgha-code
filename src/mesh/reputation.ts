/**
 * Anonymous Reputation System
 * Pseudonymous trust without identity
 */

export interface ReputationScore {
  pseudonym: string;
  completedJobs: number;
  successRate: number;
  avgQuality: number;
  stakeAmount: number;
  slashedCount: number;
  joinedAt: Date;
}

export class ReputationSystem {
  private scores: Map<string, ReputationScore> = new Map();

  register(pseudonym: string, stakeSats: number): ReputationScore {
    const score: ReputationScore = {
      pseudonym,
      completedJobs: 0,
      successRate: 0,
      avgQuality: 0,
      stakeAmount: stakeSats,
      slashedCount: 0,
      joinedAt: new Date(),
    };
    this.scores.set(pseudonym, score);
    return score;
  }

  recordJob(pseudonym: string, quality: number, verified: boolean): void {
    const score = this.scores.get(pseudonym);
    if (!score) return;
    
    score.completedJobs++;
    const oldSuccess = score.successRate * (score.completedJobs - 1);
    score.successRate = (oldSuccess + (verified ? 1 : 0)) / score.completedJobs;
    const oldQuality = score.avgQuality * (score.completedJobs - 1);
    score.avgQuality = (oldQuality + quality) / score.completedJobs;
  }

  slash(pseudonym: string, amount: number): void {
    const score = this.scores.get(pseudonym);
    if (!score) return;
    score.stakeAmount -= amount;
    score.slashedCount++;
    if (score.slashedCount >= 3) this.scores.delete(pseudonym);
  }

  canTrust(pseudonym: string, minJobs: number, minSuccess: number): boolean {
    const score = this.scores.get(pseudonym);
    return score ? score.completedJobs >= minJobs && 
           score.successRate >= minSuccess && score.stakeAmount > 0 : false;
  }

  getTopWorkers(n: number): ReputationScore[] {
    return Array.from(this.scores.values())
      .filter(s => s.completedJobs > 10)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, n);
  }
}
