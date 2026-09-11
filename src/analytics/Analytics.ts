import fs from 'fs';
import path from 'path';

export interface AnalyticsData {
  totalRequests: number;
  cacheHits: number;
  apiCalls: number;
  totalCost: number;
  savedCost: number;
  providerStats: { [provider: string]: {
    requests: number;
    cacheHits: number;
    cost: number;
    saved: number;
  }};
}

export class Analytics {
  private dataPath: string;
  private data!: AnalyticsData;

  constructor() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const direnDir = path.join(homeDir, '.diren');
    
    if (!fs.existsSync(direnDir)) {
      fs.mkdirSync(direnDir, { recursive: true });
    }
    
    this.dataPath = path.join(direnDir, 'analytics.json');
    this.loadData();
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = fs.readFileSync(this.dataPath, 'utf8');
        this.data = JSON.parse(data);
      } else {
        this.data = this.getEmptyData();
      }
    } catch {
      this.data = this.getEmptyData();
    }
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Failed to save analytics data:', error);
    }
  }

  private getEmptyData(): AnalyticsData {
    return {
      totalRequests: 0,
      cacheHits: 0,
      apiCalls: 0,
      totalCost: 0,
      savedCost: 0,
      providerStats: {}
    };
  }

  public recordCacheHit(provider: string, savedCost: number): void {
    this.data.totalRequests++;
    this.data.cacheHits++;
    this.data.savedCost += savedCost;

    if (!this.data.providerStats[provider]) {
      this.data.providerStats[provider] = {
        requests: 0,
        cacheHits: 0,
        cost: 0,
        saved: 0
      };
    }

    this.data.providerStats[provider].requests++;
    this.data.providerStats[provider].cacheHits++;
    this.data.providerStats[provider].saved += savedCost;

    this.saveData();
  }

  public recordApiCall(provider: string, cost: number): void {
    this.data.totalRequests++;
    this.data.apiCalls++;
    this.data.totalCost += cost;

    if (!this.data.providerStats[provider]) {
      this.data.providerStats[provider] = {
        requests: 0,
        cacheHits: 0,
        cost: 0,
        saved: 0
      };
    }

    this.data.providerStats[provider].requests++;
    this.data.providerStats[provider].cost += cost;

    this.saveData();
  }

  public getStats(): any {
    const cacheHitRate = this.data.totalRequests > 0 
      ? (this.data.cacheHits / this.data.totalRequests * 100).toFixed(1)
      : '0.0';

    const estimatedSavings = this.data.savedCost;
    const totalSpent = this.data.totalCost;
    const totalValue = totalSpent + estimatedSavings;
    const savingsPercentage = totalValue > 0 
      ? (estimatedSavings / totalValue * 100).toFixed(1)
      : '0.0';

    return {
      totalRequests: this.data.totalRequests,
      cacheHits: this.data.cacheHits,
      apiCalls: this.data.apiCalls,
      cacheHitRate: parseFloat(cacheHitRate),
      estimatedSavings: estimatedSavings,
      savedCost: this.data.savedCost,
      totalCost: totalSpent,
      savingsPercentage: parseFloat(savingsPercentage),
      providerStats: this.data.providerStats
    };
  }

  public clearStats(): void {
    this.data = this.getEmptyData();
    this.saveData();
  }
}