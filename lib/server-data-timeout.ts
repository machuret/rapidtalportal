import "server-only";

export const DEFAULT_PORTAL_DATA_TIMEOUT_MS = 12_000;

export class PortalDataTimeoutError extends Error {
  constructor(public readonly operation: string, public readonly timeoutMs: number) {
    super(`${operation} exceeded the portal data deadline.`);
    this.name = "PortalDataTimeoutError";
  }
}

/**
 * Bound server-rendered reads so a stalled provider cannot leave a portal page
 * loading forever. The route error boundary turns this into a friendly retry
 * screen; the operation name remains server-side for diagnostics.
 */
export async function withPortalDataTimeout<T>(
  work: PromiseLike<T>,
  operation: string,
  timeoutMs = DEFAULT_PORTAL_DATA_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new PortalDataTimeoutError(operation, timeoutMs)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
