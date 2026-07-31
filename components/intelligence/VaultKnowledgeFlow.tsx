import {
  Archive,
  Brain,
  CheckCircle2,
  FileStack,
  SearchCheck,
  ShieldAlert,
} from "lucide-react";
import type { VaultReadiness } from "@/lib/vault/readiness";
import { cn } from "@/lib/utils";
import styles from "./IntelligenceMotion.module.css";

function statusCopy(readiness: VaultReadiness) {
  if (readiness.metrics.processing > 0) {
    return {
      label: `${readiness.metrics.processing} processing`,
      tone: "active",
    } as const;
  }
  if (
    readiness.metrics.failed
    + readiness.metrics.stuckProcessing
    + readiness.metrics.reviewRequired
    + readiness.metrics.conflicted
    > 0
  ) {
    return { label: "Needs attention", tone: "attention" } as const;
  }
  if (readiness.metrics.searchable > 0) {
    return { label: "Brain ready", tone: "ready" } as const;
  }
  return { label: "Ready to learn", tone: "active" } as const;
}

export function VaultKnowledgeFlow({ readiness }: { readiness: VaultReadiness }) {
  const status = statusCopy(readiness);
  const attention =
    readiness.metrics.failed
    + readiness.metrics.stuckProcessing
    + readiness.metrics.reviewRequired
    + readiness.metrics.conflicted;
  const searchableRatio = readiness.metrics.ready > 0
    ? Math.round((readiness.metrics.searchable / readiness.metrics.ready) * 100)
    : 0;

  return (
    <section
      className={cn(styles.shell, readiness.metrics.processing > 0 && styles.working)}
      aria-label={`Live Vault knowledge flow. ${readiness.metrics.total} captured sources, ${readiness.metrics.ready} verified and ${readiness.metrics.searchable} available to the Brain.`}
    >
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Live knowledge flow</p>
          <h2 className={styles.title}>Watch the Vault feed the Brain</h2>
          <p className={styles.subtitle}>
            Sources become useful only after they are processed, verified and made searchable.
          </p>
        </div>
        <div className={styles.status} data-tone={status.tone}>
          <span className={styles.statusDot} aria-hidden />
          {status.label}
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
          <path
            className={`${styles.path} ${readiness.metrics.total > 0 ? styles.pathActive : ""}`}
            d="M 130 72 C 215 72, 215 132, 318 132"
          />
          <path
            className={`${styles.path} ${readiness.metrics.ready > 0 ? styles.pathActive : ""}`}
            d="M 130 202 C 215 202, 215 132, 318 132"
          />
          <path
            className={`${styles.path} ${readiness.metrics.searchable > 0 ? styles.pathActive : ""}`}
            d="M 442 132 C 535 132, 535 72, 630 72"
          />
          <path
            className={attention > 0 ? styles.pathWarning : styles.pathMuted}
            d="M 442 132 C 535 132, 535 202, 630 202"
          />
        </svg>

        <article className={`${styles.node} ${styles.vaultCaptured} ${readiness.metrics.total > 0 ? styles.nodeActive : ""}`}>
          <div className={styles.nodeHead}>
            <FileStack aria-hidden />
            <span className={styles.nodeLabel}>Captured</span>
          </div>
          <strong className={styles.nodeValue}>{readiness.metrics.total}</strong>
          <span className={styles.nodeDetail}>Company sources</span>
        </article>

        <article className={`${styles.node} ${styles.vaultVerified} ${readiness.metrics.ready > 0 ? styles.nodeReady : ""}`}>
          <div className={styles.nodeHead}>
            <CheckCircle2 aria-hidden />
            <span className={styles.nodeLabel}>Verified</span>
          </div>
          <strong className={styles.nodeValue}>{readiness.metrics.ready}</strong>
          <span className={styles.nodeDetail}>Usable facts</span>
        </article>

        <div className={styles.core} aria-hidden>
          <Archive />
          <strong>Vault</strong>
        </div>

        <article className={`${styles.node} ${styles.vaultSearchable} ${readiness.metrics.searchable > 0 ? styles.nodeReady : ""}`}>
          <div className={styles.nodeHead}>
            <SearchCheck aria-hidden />
            <span className={styles.nodeLabel}>Searchable</span>
          </div>
          <strong className={styles.nodeValue}>{readiness.metrics.searchable}</strong>
          <span className={styles.nodeDetail}>{searchableRatio}% of verified</span>
        </article>

        <article className={`${styles.node} ${styles.vaultAttention} ${attention > 0 ? styles.nodeWarning : ""}`}>
          <div className={styles.nodeHead}>
            {attention > 0 ? <ShieldAlert aria-hidden /> : <Brain aria-hidden />}
            <span className={styles.nodeLabel}>{attention > 0 ? "Attention" : "Connected"}</span>
          </div>
          <strong className={styles.nodeValue}>{attention > 0 ? attention : "Brain"}</strong>
          <span className={styles.nodeDetail}>{attention > 0 ? "Review or retry" : "Ready for retrieval"}</span>
        </article>
      </div>

      <div className={styles.metricStrip}>
        <div className={styles.metric}>
          <span>Overall score</span>
          <strong>{readiness.score}/100</strong>
        </div>
        <div className={styles.metric}>
          <span>Processing now</span>
          <strong>{readiness.metrics.processing}</strong>
        </div>
        <div className={styles.metric}>
          <span>Needs freshness review</span>
          <strong>{readiness.metrics.stale}</strong>
        </div>
        <div className={styles.metric}>
          <span>Open gaps</span>
          <strong>{readiness.metrics.openGaps}</strong>
        </div>
      </div>
    </section>
  );
}
