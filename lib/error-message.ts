const MESSAGE_KEYS = [
  "message",
  "error_description",
  "details",
  "hint",
  "error",
] as const;

function clean(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 500);
}

function collect(value: unknown, depth: number, seen: Set<object>): string[] {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === "string") {
    const message = clean(value);
    return message && message !== "[object Object]" ? [message] : [];
  }
  if (value instanceof Error) return collect(value.message, depth + 1, seen);
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collect(entry, depth + 1, seen)).slice(0, 8);
  }
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const record = value as Record<string, unknown>;
  const validationMessages: string[] = [];
  if (Array.isArray(record.formErrors)) {
    validationMessages.push(...collect(record.formErrors, depth + 1, seen));
  }
  if (record.fieldErrors && typeof record.fieldErrors === "object") {
    for (const [field, errors] of Object.entries(record.fieldErrors as Record<string, unknown>)) {
      const messages = collect(errors, depth + 1, seen);
      validationMessages.push(...messages.map((message) => `${field}: ${message}`));
    }
  }
  if (validationMessages.length) return validationMessages.slice(0, 8);

  for (const key of MESSAGE_KEYS) {
    if (record[key] !== undefined) {
      const messages = collect(record[key], depth + 1, seen);
      if (messages.length) return messages;
    }
  }
  return [];
}

/**
 * Converts API, provider and Zod error payloads into safe user-facing text.
 * Never relies on String(object), which is how `[object Object]` reached the UI.
 */
export function errorMessage(value: unknown, fallback = "Something went wrong. Please try again."): string {
  const messages = Array.from(new Set(collect(value, 0, new Set())));
  return messages.length ? messages.join("; ") : fallback;
}
