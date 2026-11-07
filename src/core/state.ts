export interface Readable<T> {
  subscribe(listener: (value: T) => void): () => void;
}

export function createState<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get value() { return value; },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      listener(value);
      return () => { listeners.delete(listener); };
    },
    set(next: T) {
      value = next;
      for (const listener of listeners) listener(value);
    },
  };
}
