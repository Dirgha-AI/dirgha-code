// Type stubs for Web APIs used in Node.js 20+ (ReadableStream is
// built-in since v18 but no DOM lib in tsconfig).
interface ReadableStream<R = any> {
  getReader(): ReadableStreamDefaultReader<R>;
}

interface ReadableStreamDefaultReader<R = any> {
  read(): Promise<ReadableStreamReadResult<R>>;
  releaseLock(): void;
}

interface ReadableStreamReadResult<T> {
  done: boolean;
  value: T;
}
