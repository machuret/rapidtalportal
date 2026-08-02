"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  CoachActionDraft,
  CoachRole,
  CoachTaskOption,
  CoachTeamMember,
} from "./useCoachChat";

type CreateTaskDraft = Extract<CoachActionDraft, { type: "create_task" }>;
type SendMessageDraft = Extract<CoachActionDraft, { type: "send_message" }>;
type CreateGoalDraft = Extract<CoachActionDraft, { type: "create_goal" }>;
type CreateCommitmentDraft = Extract<CoachActionDraft, { type: "create_commitment" }>;
type CreateMemoryDraft = Extract<CoachActionDraft, { type: "create_memory" }>;
type TaskActionDraft = Extract<CoachActionDraft, { taskId: string }>;

/**
 * Editable fields for a Coach action preview. Renders the form matching the
 * draft type — update_task, submit_review and review_task share one task form,
 * exactly as they did before the extraction. Nothing executes here; the
 * confirm button (and its idempotent POST) stays in `ChatTurn`.
 */
export function ActionDraftFields({
  actionComplete,
  actionDraft,
  setActionDraft,
  teamMembers,
  taskOptions,
  coachRole,
}: {
  actionComplete: boolean;
  actionDraft: CoachActionDraft;
  setActionDraft: (draft: CoachActionDraft) => void;
  teamMembers: CoachTeamMember[];
  taskOptions: CoachTaskOption[];
  coachRole: CoachRole;
}) {
  if (actionComplete) return null;
  if (actionDraft.type === "create_task") {
    return <CreateTaskFields draft={actionDraft} onChange={setActionDraft} teamMembers={teamMembers} />;
  }
  if (actionDraft.type === "send_message") {
    return <SendMessageFields draft={actionDraft} onChange={setActionDraft} />;
  }
  if (actionDraft.type === "create_goal") {
    return <CreateGoalFields draft={actionDraft} onChange={setActionDraft} />;
  }
  if (actionDraft.type === "create_commitment") {
    return <CreateCommitmentFields draft={actionDraft} onChange={setActionDraft} />;
  }
  if (actionDraft.type === "create_memory") {
    return <CreateMemoryFields draft={actionDraft} onChange={setActionDraft} />;
  }
  if ("taskId" in actionDraft) {
    return <TaskActionFields draft={actionDraft} onChange={setActionDraft} taskOptions={taskOptions} coachRole={coachRole} />;
  }
  return null;
}

function CreateTaskFields({
  draft,
  onChange,
  teamMembers,
}: {
  draft: CreateTaskDraft;
  onChange: (draft: CoachActionDraft) => void;
  teamMembers: CoachTeamMember[];
}) {
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-xs text-zinc-400">Task title
        <Input value={draft.title} maxLength={300}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
      <label className="text-xs text-zinc-400">Task brief
        <Textarea value={draft.brief} maxLength={10000} rows={5}
          onChange={(event) => onChange({ ...draft, brief: event.target.value })}
          className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-400">Assign to
          <select value={draft.assigneeId ?? ""}
            onChange={(event) => onChange({ ...draft, assigneeId: event.target.value || null })}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
            <option value="">Leave unassigned</option>
            {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-400">Priority
          <select value={draft.priority}
            onChange={(event) => onChange({ ...draft, priority: Number(event.target.value) as 1 | 2 | 3 | 4 })}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
            <option value={1}>Urgent</option><option value={2}>High</option><option value={3}>Normal</option><option value={4}>Low</option>
          </select>
        </label>
        <label className="text-xs text-zinc-400">Due date
          <Input type="date" value={draft.dueDate ?? ""}
            onChange={(event) => onChange({ ...draft, dueDate: event.target.value || null })}
            className="mt-1.5 bg-zinc-900 text-zinc-100" />
        </label>
      </div>
    </div>
  );
}

function SendMessageFields({
  draft,
  onChange,
}: {
  draft: SendMessageDraft;
  onChange: (draft: CoachActionDraft) => void;
}) {
  return (
    <label className="mt-3 block text-xs text-zinc-400">Message
      <Textarea value={draft.message} maxLength={4000} rows={5}
        onChange={(event) => onChange({ ...draft, message: event.target.value })}
        className="mt-1.5 bg-zinc-900 text-zinc-100" />
    </label>
  );
}

function CreateGoalFields({
  draft,
  onChange,
}: {
  draft: CreateGoalDraft;
  onChange: (draft: CoachActionDraft) => void;
}) {
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-xs text-zinc-400">Goal
        <Input value={draft.title} maxLength={300} onChange={(event) => onChange({ ...draft, title: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
      <label className="text-xs text-zinc-400">Success looks like
        <Textarea value={draft.outcome} maxLength={4000} rows={3} onChange={(event) => onChange({ ...draft, outcome: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
      <label className="text-xs text-zinc-400">Target date
        <Input type="date" value={draft.targetDate ?? ""} onChange={(event) => onChange({ ...draft, targetDate: event.target.value || null })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
    </div>
  );
}

function CreateCommitmentFields({
  draft,
  onChange,
}: {
  draft: CreateCommitmentDraft;
  onChange: (draft: CoachActionDraft) => void;
}) {
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-xs text-zinc-400">Commitment
        <Textarea value={draft.commitment} maxLength={1000} rows={3} onChange={(event) => onChange({ ...draft, commitment: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
      {draft.goalId && <p className="text-xs text-zinc-500">Linked to a current private goal. <button type="button" onClick={() => onChange({ ...draft, goalId: null })} className="text-purple-300 hover:text-purple-200">Remove link</button></p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">Due date
          <Input type="date" value={draft.dueDate ?? ""} onChange={(event) => onChange({ ...draft, dueDate: event.target.value || null })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
        </label>
        <label className="text-xs text-zinc-400">Weekly Coach check-ins start
          <Input type="date" value={draft.checkInDate ?? ""} onChange={(event) => onChange({ ...draft, checkInDate: event.target.value || null })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
        </label>
      </div>
    </div>
  );
}

function CreateMemoryFields({
  draft,
  onChange,
}: {
  draft: CreateMemoryDraft;
  onChange: (draft: CoachActionDraft) => void;
}) {
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-xs text-zinc-400">Memory type
        <select value={draft.kind} onChange={(event) => onChange({ ...draft, kind: event.target.value as "preference" | "decision" | "context" | "challenge" })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
          <option value="preference">Preference</option><option value="decision">Decision</option><option value="context">Context</option><option value="challenge">Recurring challenge</option>
        </select>
      </label>
      <label className="text-xs text-zinc-400">What the Coach should remember
        <Textarea value={draft.content} maxLength={2000} rows={3} onChange={(event) => onChange({ ...draft, content: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
    </div>
  );
}

function TaskActionFields({
  draft,
  onChange,
  taskOptions,
  coachRole,
}: {
  draft: TaskActionDraft;
  onChange: (draft: CoachActionDraft) => void;
  taskOptions: CoachTaskOption[];
  coachRole: CoachRole;
}) {
  return (
    <div className="mt-3 grid gap-3">
      <label className="text-xs text-zinc-400">Task
        <select value={draft.taskId} onChange={(event) => onChange({ ...draft, taskId: event.target.value })}
          className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
          {taskOptions.filter((task) => draft.type !== "review_task" || task.status === "review").map((task) => <option key={task.id} value={task.id}>{task.title} — {task.status.replaceAll("_", " ")}</option>)}
        </select>
      </label>
      {draft.type === "update_task" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-zinc-400">Status
            <select value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value as "todo" | "in_progress" | "review" | "done" })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
              <option value="todo">To do</option><option value="in_progress">In progress</option>
              {coachRole === "client" && <><option value="review">Review</option><option value="done">Done</option></>}
            </select>
          </label>
          <label className="text-xs text-zinc-400">Priority
            <select value={draft.priority} onChange={(event) => onChange({ ...draft, priority: Number(event.target.value) as 1 | 2 | 3 | 4 })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
              <option value={1}>Urgent</option><option value={2}>High</option><option value={3}>Normal</option><option value={4}>Low</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400">Due date
            <Input type="date" value={draft.dueDate ?? ""} onChange={(event) => onChange({ ...draft, dueDate: event.target.value || null })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
          </label>
        </div>
      )}
      {draft.type === "review_task" && (
        <label className="text-xs text-zinc-400">Decision
          <select value={draft.decision} onChange={(event) => onChange({ ...draft, decision: event.target.value as "approve" | "changes" })} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
            <option value="approve">Approve</option><option value="changes">Request changes</option>
          </select>
        </label>
      )}
      <label className="text-xs text-zinc-400">{draft.type === "submit_review" ? "Submission note" : draft.type === "review_task" ? "Review note" : "Update note"}
        <Textarea value={draft.note} maxLength={2000} rows={3} onChange={(event) => onChange({ ...draft, note: event.target.value })} className="mt-1.5 bg-zinc-900 text-zinc-100" />
      </label>
    </div>
  );
}
