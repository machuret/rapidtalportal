import {
  Archive,
  BookOpenCheck,
  Brain,
  Dna,
  FileQuestion,
  ListChecks,
  MessageSquareText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./IntelligenceMotion.module.css";

export type AskSourceKind = "dna" | "vault" | "kb" | "sop";
export type AskFlowState = "idle" | "searching" | "answering" | "ready";

const SOURCE_NODES: Array<{
  kind: AskSourceKind;
  label: string;
  detail: string;
  icon: typeof Dna;
  position: string;
}> = [
  { kind: "dna", label: "Company DNA", detail: "Identity and goals", icon: Dna, position: styles.sourceDna },
  { kind: "vault", label: "Vault", detail: "Company evidence", icon: Archive, position: styles.sourceVault },
  { kind: "kb", label: "Knowledge", detail: "Approved answers", icon: BookOpenCheck, position: styles.sourceKnowledge },
  { kind: "sop", label: "SOPs", detail: "Working processes", icon: ListChecks, position: styles.sourceSop },
];

const STATE_COPY: Record<AskFlowState, { label: string; tone: "active" | "ready" }> = {
  idle: { label: "Ready for a question", tone: "active" },
  searching: { label: "Resolving snapshot", tone: "active" },
  answering: { label: "Building grounded answer", tone: "active" },
  ready: { label: "Answer grounded", tone: "ready" },
};

export function AskBrainFlow({
  companyName,
  state,
  activeKinds,
  snapshotAvailable,
}: {
  companyName: string;
  state: AskFlowState;
  activeKinds: AskSourceKind[];
  snapshotAvailable: boolean;
}) {
  const copy = STATE_COPY[state];
  const working = state === "searching" || state === "answering";
  const active = new Set(activeKinds);

  return (
    <section
      className={cn(styles.shell, working && styles.working)}
      aria-label={`Ask the Brain for ${companyName}. ${copy.label}.`}
    >
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Live grounded retrieval</p>
          <h1 className={styles.title}>Ask the Brain</h1>
          <p className={styles.subtitle}>
            Ask anything about {companyName}. The Brain resolves relevant company context before it answers.
          </p>
        </div>
        <div className={styles.status} data-tone={copy.tone}>
          <span className={styles.statusDot} aria-hidden />
          {snapshotAvailable && state === "ready" ? "Snapshot saved" : copy.label}
        </div>
      </div>

      <div className={styles.stage}>
        <span className={styles.ambient} aria-hidden />
        <svg
          className={styles.connections}
          viewBox="0 0 760 265"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path className={working ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 142 132 C 225 132, 235 132, 322 132" />
          <path className={active.has("dna") || working ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 220 55 C 300 55, 295 105, 333 116" />
          <path className={active.has("vault") || working ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 220 210 C 300 210, 295 160, 333 148" />
          <path className={active.has("kb") || working ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 540 55 C 460 55, 465 105, 427 116" />
          <path className={active.has("sop") || working ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 540 210 C 460 210, 465 160, 427 148" />
          <path className={state === "answering" || state === "ready" ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 438 132 C 525 132, 535 132, 618 132" />
        </svg>

        <article className={`${styles.node} ${styles.sourceNode} ${styles.askInput} ${working ? styles.nodeActive : ""}`}>
          <div className={styles.nodeHead}>
            <FileQuestion aria-hidden />
            <span className={styles.nodeLabel}>Question</span>
          </div>
          <strong className={styles.nodeValue}>{working ? "Received" : "Waiting"}</strong>
        </article>

        {SOURCE_NODES.map((source) => {
          const Icon = source.icon;
          const isActive = active.has(source.kind) || working;
          return (
            <article
              key={source.kind}
              className={cn(
                styles.node,
                styles.sourceNode,
                source.position,
                isActive && styles.nodeActive,
                active.has(source.kind) && styles.nodeReady,
              )}
            >
              {isActive && <span className={styles.nodePulse} aria-hidden />}
              <div className={styles.nodeHead}>
                <Icon aria-hidden />
                <span className={styles.nodeLabel}>{source.label}</span>
              </div>
              <strong className={styles.nodeValue}>{active.has(source.kind) ? "Used" : working ? "Checking" : "Available"}</strong>
              <span className={styles.nodeDetail}>{source.detail}</span>
            </article>
          );
        })}

        <div className={styles.askCore} aria-hidden>
          <Brain />
          <span>{working ? "Thinking" : "Brain"}</span>
        </div>

        <article className={`${styles.node} ${styles.sourceNode} ${styles.askOutput} ${state === "ready" ? styles.nodeReady : ""}`}>
          {state === "answering" && <span className={styles.nodePulse} aria-hidden />}
          <div className={styles.nodeHead}>
            <MessageSquareText aria-hidden />
            <span className={styles.nodeLabel}>Answer</span>
          </div>
          <strong className={styles.nodeValue}>
            {state === "ready" ? "Grounded" : state === "answering" ? "Streaming" : "Waiting"}
          </strong>
        </article>
      </div>
    </section>
  );
}
