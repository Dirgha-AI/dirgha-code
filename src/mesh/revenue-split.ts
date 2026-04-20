// revenue-split.ts - 94 lines

export interface Contributor {
  id: string;
  publicKey: string;
  weight: number;  // 0-1, sum to 1.0
  role: 'author' | 'reviewer' | 'tester' | 'documenter';
}

export interface DerivativeLink {
  upstreamProject: string;
  downstreamProject: string;
  percentage: number;  // 0.05 = 5%
  depth: number;       // 0 = direct, 1 = once-removed
}

export class RevenueSplitter {
  private contributors: Map<string, Contributor> = new Map();
  private upstreamLinks: DerivativeLink[] = [];

  addContributor(c: Contributor): void {
    this.contributors.set(c.id, c);
  }

  registerDerivative(upstream: string, downstream: string, pct: number): void {
    this.upstreamLinks.push({
      upstreamProject: upstream,
      downstreamProject: downstream,
      percentage: pct,
      depth: 0,
    });

    // Cascade to upstream's upstreams (0.25% to grandparents)
    const grandparents = this.findUpstream(upstream);
    grandparents.forEach(g => {
      this.upstreamLinks.push({
        upstreamProject: g.upstreamProject,
        downstreamProject: downstream,
        percentage: pct * 0.05,  // 5% of derivative %
        depth: g.depth + 1,
      });
    });
  }

  calculateSplit(totalRevenue: number): Map<string, number> {
    const splits = new Map<string, number>();

    // Contributors split 90%
    const contributorPool = totalRevenue * 0.9;
    const totalWeight = Array.from(this.contributors.values())
      .reduce((sum, c) => sum + c.weight, 0);

    for (const [id, c] of this.contributors) {
      splits.set(id, (c.weight / totalWeight) * contributorPool);
    }

    // Upstreams get 10%
    const upstreamPool = totalRevenue * 0.1;
    for (const link of this.upstreamLinks.filter(l => l.depth === 0)) {
      const current = splits.get(link.upstreamProject) || 0;
      splits.set(link.upstreamProject,
        current + (link.percentage * upstreamPool));
    }

    return splits;
  }

  private findUpstream(project: string): DerivativeLink[] {
    return this.upstreamLinks.filter(l => l.downstreamProject === project);
  }
}

// Example: Alice builds on Bob's lib, Bob built on Carol's
// Revenue: 1000 sats
// Alice (author): 450 sats (50% of 90%)
// Bob (upstream): 50 sats (5% of 1000)
// Carol (grandparent): 2.5 sats (0.25% of 1000)
