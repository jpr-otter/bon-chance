import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoggerService {
  private logs: string[] = [];

  log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;

    // Console output
    if (data) {
      console.log(logEntry, data);
    } else {
      console.log(logEntry);
    }

    // Store in memory
    this.logs.push(data ? `${logEntry} ${JSON.stringify(data)}` : logEntry);

    // Keep only last 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  downloadLogs() {
    const logContent = this.logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bonchance-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  sendLogsToTerminal() {
    // This will output all logs to console in a copyable format
    console.group('=== BonChance Debug Logs ===');
    this.logs.forEach((log) => console.log(log));
    console.groupEnd();

    // Also output as one big string for easy copying
    console.log('=== COPYABLE LOGS ===');
    console.log(this.logs.join('\n'));
  }
}
