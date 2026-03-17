import fs from 'node:fs';
import path from 'node:path';

type LogLevel = 'DEBUG' | 'INFO ' | 'WARN ' | 'ERROR';

/**
 * Lightweight debug logger.  Inactive by default — call init() once at startup
 * (triggered by the --debug CLI flag) to enable file output.
 *
 * All log calls are no-ops when the logger is not active, so it is safe to
 * add instrumentation throughout the codebase without affecting normal runs.
 *
 * Log file location: <logDir>/cerebro-debug.log  (append mode, survives
 * multiple runs for easy before/after comparison).
 *
 * When active, the logger also registers process-level handlers so that
 * uncaught exceptions and unhandled promise rejections are captured in the
 * log file rather than disappearing silently.
 */
class Logger {
  private _active = false;
  private _path = '';
  private stream: fs.WriteStream | null = null;

  /**
   * Activate debug logging.  Idempotent — a second call is silently ignored.
   *
   * @param logDir  Directory where the log file is created.
   *                Defaults to process.cwd() — the "agents-output" working
   *                directory where the cerebro CLI was invoked.
   */
  init(logDir: string = process.cwd()): void {
    if (this._active) return;

    logDir = path.resolve(logDir);

    // Ensure the log directory exists before opening the stream.
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (mkdirErr) {
      process.stderr.write(`[cerebro] could not create log directory: ${(mkdirErr as Error).message}\n`);
      logDir = process.cwd();
    }

    this._active = true;
    this._path = path.join(logDir, 'cerebro-debug.log');
    this.stream = fs.createWriteStream(this._path, { flags: 'a' });

    // Handle write-stream errors gracefully — never crash due to a logging failure.
    this.stream.on('error', (err) => {
      process.stderr.write(`[cerebro] debug log write error: ${err.message}\n`);
      this.stream = null;
    });

    // Capture unhandled errors at the process level so they appear in the log
    // rather than being swallowed or printed only to stderr.
    process.on('uncaughtException', this._onUncaughtException);
    process.on('unhandledRejection', this._onUnhandledRejection);
    process.on('exit', this._onExit);

    this._write('INFO ', '='.repeat(60));
    this._write('INFO ', `cerebro debug session started  pid=${process.pid}`);
    this._write('INFO ', `cwd=${process.cwd()}`);
    this._write('INFO ', `node=${process.version}  platform=${process.platform}`);
    this._write('INFO ', '='.repeat(60));
  }

  /** True when debug logging is active. */
  get active(): boolean {
    return this._active;
  }

  /** Absolute path of the log file, or empty string if not active. */
  get logPath(): string {
    return this._path;
  }

  debug(message: string, data?: unknown): void {
    this._write('DEBUG', message, data);
  }

  info(message: string, data?: unknown): void {
    this._write('INFO ', message, data);
  }

  warn(message: string, data?: unknown): void {
    this._write('WARN ', message, data);
  }

  error(message: string, data?: unknown): void {
    this._write('ERROR', message, data);
  }

  /** Flush and close the underlying write stream. */
  close(): void {
    if (!this._active || !this.stream) return;
    this._write('INFO ', `cerebro debug session ended  at=${new Date().toISOString()}`);
    this.stream.end();
    this.stream = null;
    this._active = false;
    this._path = '';
    process.off('uncaughtException', this._onUncaughtException);
    process.off('unhandledRejection', this._onUnhandledRejection);
    process.off('exit', this._onExit);
  }

  /**
   * Reset internal state.  Intended only for unit tests — do not call from
   * production code.
   */
  _reset(): void {
    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }
    this._active = false;
    this._path = '';
    process.off('uncaughtException', this._onUncaughtException);
    process.off('unhandledRejection', this._onUnhandledRejection);
    process.off('exit', this._onExit);
  }

  // Arrow functions preserve `this` so the same reference can be passed to
  // both process.on() and process.off().
  private _onUncaughtException = (err: Error): void => {
    this._write('ERROR', `[FATAL] uncaughtException  ${err.message}`, err.stack);
  };

  private _onUnhandledRejection = (reason: unknown): void => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    this._write('ERROR', `[FATAL] unhandledRejection  ${msg}`, stack);
  };

  private _onExit = (): void => {
    if (this._active) {
      this._write('INFO ', `process exit  code=${process.exitCode ?? 0}`);
    }
  };

  private _write(level: LogLevel, message: string, data?: unknown): void {
    if (!this._active || !this.stream) return;
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] ${message}`;
    if (data !== undefined) {
      try {
        const json = JSON.stringify(data, null, 2);
        line += '\n' + json.split('\n').map(l => '  ' + l).join('\n');
      } catch {
        line += `\n  [unserializable: ${String(data)}]`;
      }
    }
    this.stream.write(line + '\n');
  }
}

export const logger = new Logger();
