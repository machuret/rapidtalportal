export function awaitingApprovalCount(taskApprovals: number, contentApprovals: number): number {
  return Math.max(0, taskApprovals) + Math.max(0, contentApprovals);
}
