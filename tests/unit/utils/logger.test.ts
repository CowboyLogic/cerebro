import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// ── fs mock ───────────────────────────────────────────────────────────────────
// Must be hoisted so the factory runs before the logger module is imported.

const mockWrite = vi.fn();
const mockEnd = vi.fn();
const mockDestroy = vi.fn();
const mockOn = vi.fn();

const mockCreateWriteStream = vi.fn();
const mockMkdirSync = vi.fn();

vi.mock('node:fs', () => ({
  default: {
    createWriteStream: mockCreateWriteStream,
    mkdirSync: mockMkdirSync,
  },
  createWriteStream: mockCreateWriteStream,
  mkdirSync: mockMkdirSync,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMockStream() {
  return { write: mockWrite, end: mockEnd, destroy: mockDestroy, on: mockOn };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Logger', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockCreateWriteStream.mockReturnValue(makeMockStream());

    // Reset singleton state between tests
    const { logger } = await import('../../../src/utils/logger.js');
    logger._reset();
  });

  it('is inactive before init()', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    expect(logger.active).toBe(false);
    expect(logger.logPath).toBe('');
  });

  it('init() creates a write stream in append mode at the expected path', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/some/dir');
    expect(mockCreateWriteStream).toHaveBeenCalledOnce();
    const [filePath, opts] = mockCreateWriteStream.mock.calls[0];
    expect(filePath).toMatch(/cerebro-debug\.log$/);
    expect(filePath).toContain('some');
    expect(opts).toMatchObject({ flags: 'a' });
  });

  it('init() sets active to true and exposes logPath', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    expect(logger.active).toBe(true);
    expect(logger.logPath).toContain('cerebro-debug.log');
  });

  it('init() is idempotent — second call does not create another stream', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/dir/a');
    logger.init('/dir/b');
    expect(mockCreateWriteStream).toHaveBeenCalledOnce();
  });

  it('debug() is a no-op when not active', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.debug('should not be written');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('debug() writes an entry with DEBUG level when active', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    mockWrite.mockClear(); // clear the banner writes from init()
    logger.debug('hello world');
    expect(mockWrite).toHaveBeenCalledOnce();
    const written: string = mockWrite.mock.calls[0][0];
    expect(written).toContain('[DEBUG]');
    expect(written).toContain('hello world');
  });

  it('log entries include an ISO timestamp', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    mockWrite.mockClear();
    logger.info('timestamp test');
    const written: string = mockWrite.mock.calls[0][0];
    expect(written).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('write levels are labelled correctly (INFO, WARN, ERROR)', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    mockWrite.mockClear();
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');
    const written = mockWrite.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(written[0]).toMatch(/\[INFO\s*\]/);
    expect(written[1]).toMatch(/\[WARN\s*\]/);
    expect(written[2]).toMatch(/\[ERROR\]/);
  });

  it('data objects are JSON-serialized and indented in the log entry', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    mockWrite.mockClear();
    logger.debug('with data', { key: 'value', count: 3 });
    const written: string = mockWrite.mock.calls[0][0];
    expect(written).toContain('"key": "value"');
    expect(written).toContain('"count": 3');
  });

  it('close() calls stream.end() and deactivates the logger', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    logger.close();
    expect(mockEnd).toHaveBeenCalledOnce();
    expect(logger.active).toBe(false);
    expect(logger.logPath).toBe('');
  });

  it('close() on an inactive logger is a safe no-op', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    expect(() => logger.close()).not.toThrow();
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('init() ensures the log directory exists via mkdirSync', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/some/nested/dir');
    expect(mockMkdirSync).toHaveBeenCalledWith(path.resolve('/some/nested/dir'), { recursive: true });
  });

  it('init() with a relative path resolves it to an absolute path', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('./some/relative');
    expect(logger.logPath).not.toContain('./');
    expect(logger.logPath).toMatch(/cerebro-debug\.log$/);
    expect(logger.logPath).toContain('some');
    expect(logger.logPath).toContain('relative');
    expect(path.isAbsolute(logger.logPath)).toBe(true);
  });

  it('init() registers a stream error listener', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    // The stream's on() method should have been called at least once (for 'error')
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('stream error handler disables writes without throwing', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');

    // Capture the error handler that was registered
    const errorHandlerCall = mockOn.mock.calls.find(c => c[0] === 'error');
    expect(errorHandlerCall).toBeTruthy();
    const streamErrorHandler = errorHandlerCall![1] as (err: Error) => void;

    mockWrite.mockClear();
    // Simulate a write-stream failure
    streamErrorHandler(new Error('ENOSPC: no space left on device'));

    // Subsequent writes should be no-ops (stream nulled out)
    logger.debug('after stream error');
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('close() removes process-level error listeners', async () => {
    const processOffSpy = vi.spyOn(process, 'off');
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    logger.close();
    expect(processOffSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOffSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    expect(processOffSpy).toHaveBeenCalledWith('exit', expect.any(Function));
    processOffSpy.mockRestore();
  });

  it('_reset() removes process-level error listeners', async () => {
    const processOffSpy = vi.spyOn(process, 'off');
    const { logger } = await import('../../../src/utils/logger.js');
    logger.init('/tmp/test');
    logger._reset();
    expect(processOffSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    expect(processOffSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    expect(processOffSpy).toHaveBeenCalledWith('exit', expect.any(Function));
    processOffSpy.mockRestore();
  });
});
