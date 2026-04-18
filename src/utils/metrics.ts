type MetricValue = number | string;

class MetricsCollector {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  increment(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
  }

  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  histogram(name: string, value: number): void {
    const values = this.histograms.get(name) ?? [];
    values.push(value);
    this.histograms.set(name, values);
  }

  getReport(): Record<string, MetricValue> {
    const report: Record<string, MetricValue> = {};
    
    for (const [name, value] of this.counters) {
      report[`${name}_total`] = value;
    }
    
    for (const [name, value] of this.gauges) {
      report[name] = value;
    }
    
    for (const [name, values] of this.histograms) {
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        report[`${name}_avg`] = avg;
        report[`${name}_count`] = values.length;
      }
    }
    
    return report;
  }
}

export const metrics = new MetricsCollector();
