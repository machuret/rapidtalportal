import type { ContentProject } from "@/types/content";

type ProjectProgressInput = Pick<
  ContentProject,
  "current_step" | "status" | "last_error_message" | "last_operation"
>;

export function contentProjectProgress(project: ProjectProgressInput): string {
  if (project.last_error_message && project.last_operation === "generate") {
    return "Generation failed — ready to retry";
  }
  if (project.status === "saved") return "Saved idea";
  if (project.current_step === "complete") {
    return `${project.status.charAt(0).toUpperCase()}${project.status.slice(1)}`;
  }
  if (project.current_step === "idea") return "Idea selected";
  if (project.current_step === "brief") return "Brief in progress";
  if (project.current_step === "evidence") return "Choosing sources";
  if (project.current_step === "generate") return "Ready to generate";
  if (project.current_step === "edit") return "Draft";
  return "In review";
}
