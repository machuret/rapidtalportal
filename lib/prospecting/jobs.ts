/**
 * Stable public facade for Lead Generation job operations.
 *
 * Callers should import from this module. Runtime persistence, paid-run start,
 * provider advancement/recovery and completion are implemented independently
 * so adding a job type does not grow one conditional orchestrator.
 */
export { ProspectingJobError } from "@/lib/prospecting/job-errors";
export type { ProspectingDb } from "@/lib/prospecting/job-runtime";
export {
  startProspectingEnrichment,
  startProspectingRun,
  type StartProspectingRunOptions,
} from "@/lib/prospecting/job-start";
export {
  advanceProspectingJob,
  requestProspectingCancellation,
  prospectingJobLifecyclePolicies,
} from "@/lib/prospecting/job-advance";
