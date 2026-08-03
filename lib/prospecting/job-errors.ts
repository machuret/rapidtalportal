export class ProspectingJobError extends Error {
  constructor(message: string, public readonly status = 500, public readonly retryable = false) {
    super(message);
    this.name = "ProspectingJobError";
  }
}
