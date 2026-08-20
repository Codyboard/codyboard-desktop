const queues = new Map<string, Promise<unknown>>();

export function withSettingsFileLock<T>(
  file: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  queues.set(file, next.then(() => undefined, () => undefined));
  return next;
}
