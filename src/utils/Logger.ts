export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  public info(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  public warn(message: string, ...args: any[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(`[WARN] ${new Date().toISOString()} ${message}`, ...args);
    }
  }

  public error(message: string, error?: any): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(`[ERROR] ${new Date().toISOString()} ${message}`, error);
    }
  }

  public request(method: string, url: string, provider: string, cached: boolean): void {
    const cacheStatus = cached ? '🎯 CACHE HIT' : '📡 API CALL';
    this.info(`${cacheStatus} ${method} ${url} [${provider}]`);
  }

  public savings(provider: string, saved: number, total: number): void {
    const percentage = total > 0 ? ((saved / total) * 100).toFixed(1) : '0';
    this.info(`💰 SAVINGS [${provider}] $${saved.toFixed(4)} saved (${percentage}%)`);
  }
}