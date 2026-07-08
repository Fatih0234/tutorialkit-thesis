export function normalizePath(path: string): string {
  if (!path) {
    return path;
  }

  return path.startsWith('/') ? path : `/${path}`;
}

export function normalizeFiles<T extends string | Uint8Array>(files: Record<string, T>): Record<string, T> {
  const result: Record<string, T> = {};

  for (const [path, value] of Object.entries(files)) {
    result[normalizePath(path)] = value;
  }

  return result;
}
