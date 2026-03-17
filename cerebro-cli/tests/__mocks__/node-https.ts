import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Response map: URL pattern → { statusCode, body, headers }
const responseMap = new Map<string, { statusCode: number; body: string; headers?: Record<string, string> }>();

export function seedResponse(urlPattern: string, statusCode: number, body: string, headers?: Record<string, string>) {
  responseMap.set(urlPattern, { statusCode, body, headers: headers || {} });
}

export function clearResponses() {
  responseMap.clear();
}

export function seedError(urlPattern: string, error: Error) {
  responseMap.set(urlPattern, { statusCode: -1, body: error.message });
}

function findResponse(url: string) {
  // Exact match first
  if (responseMap.has(url)) return responseMap.get(url)!;
  // Substring match
  for (const [pattern, response] of responseMap) {
    if (url.includes(pattern)) return response;
  }
  return { statusCode: 404, body: `Not found: ${url}`, headers: {} };
}

class MockIncomingMessage extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  constructor(statusCode: number, headers: Record<string, string> = {}) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

const get = vi.fn((url: string, optionsOrCallback: any, maybeCallback?: any) => {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  const response = findResponse(url);

  const req = new EventEmitter() as any;
  req.on = req.on.bind(req);

  setImmediate(() => {
    if (response.statusCode === -1) {
      req.emit('error', new Error(response.body));
      return;
    }

    const res = new MockIncomingMessage(response.statusCode, response.headers || {});
    callback(res);

    setImmediate(() => {
      res.emit('data', response.body);
      res.emit('end');
    });
  });

  return req;
});

export default { get };
export { get };
