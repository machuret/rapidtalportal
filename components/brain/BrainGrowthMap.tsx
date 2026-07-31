import { Brain } from "lucide-react";
import type {
  BrainReadiness,
  BrainReadinessDimensionKey,
  BrainReadinessStatus,
} from "@/lib/brain/readiness";
import styles from "./BrainGrowthMap.module.css";

const POSITION: Record<BrainReadinessDimensionKey, string> = {
  knowledge: styles.knowledge,
  voice: styles.voice,
  personalisation: styles.personalisation,
  reliability: styles.reliability,
  market: styles.market,
};

const CONNECTION: Record<BrainReadinessDimensionKey, { x1: number; y1: number; x2: number; y2: number }> = {
  knowledge: { x1: 174, y1: 82, x2: 316, y2: 158 },
  voice: { x1: 586, y1: 82, x2: 444, y2: 158 },
  personalisation: { x1: 184, y1: 232, x2: 302, y2: 212 },
  reliability: { x1: 576, y1: 232, x2: 458, y2: 212 },
  market: { x1: 380, y1: 340, x2: 380, y2: 268 },
};

function statusLabel(status: BrainReadinessStatus) {
  return status === "not_ready"
    ? "Not ready"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function strengthClass(score: number) {
  if (score >= 80) return styles.strengthStrong;
  if (score >= 55) return styles.strengthDeveloping;
  if (score >= 25) return styles.strengthLimited;
  return styles.strengthQuiet;
}

export function BrainGrowthMap({
  clientName,
  readiness,
}: {
  clientName: string;
  readiness: BrainReadiness;
}) {
  return (
    <section
      className={styles.shell}
      aria-label={`Current Brain readiness visualisation for ${clientName}. Motion represents measured capability, not live work.`}
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Current capability map</p>
          <h2 className={styles.title}>Watch the business Brain grow</h2>
          <p className={styles.subtitle}>
            Every trusted source, approved lesson and successful retrieval strengthens a pathway.
          </p>
        </div>
        <div className={styles.observing}>
          <span className={styles.liveDot} aria-hidden />
          Measured snapshot
        </div>
      </div>

      <div className={styles.stage}>
        <div className={styles.ambient} aria-hidden />

        <svg
          className={styles.connections}
          viewBox="0 0 760 410"
          preserveAspectRatio="none"
          aria-hidden
        >
          {readiness.dimensions.map((dimension) => {
            const line = CONNECTION[dimension.key];
            return (
              <line
                key={dimension.key}
                className={`${styles.connection} ${strengthClass(dimension.score)}`}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
              />
            );
          })}
        </svg>

        <div className={styles.brainWrap} aria-hidden>
          <span className={styles.brainHalo} />
          <Brain className={styles.brainOutline} strokeWidth={0.85} />
          <span className={`${styles.spark} ${styles.sparkOne}`} />
          <span className={`${styles.spark} ${styles.sparkTwo}`} />
          <span className={`${styles.spark} ${styles.sparkThree}`} />
          <span className={`${styles.spark} ${styles.sparkFour}`} />
          <span className={`${styles.spark} ${styles.sparkFive}`} />
        </div>

        <div className={styles.core}>
          <span>{statusLabel(readiness.overallStatus)}</span>
          <strong>Brain</strong>
          <small>readiness</small>
        </div>

        {readiness.dimensions.map((dimension) => (
          <article
            key={dimension.key}
            className={`${styles.node} ${POSITION[dimension.key]} ${strengthClass(dimension.score)}`}
            data-strength={dimension.status}
          >
            <span className={styles.nodePulse} aria-hidden />
            <div>
              <span className={styles.nodeLabel}>{dimension.label}</span>
              <strong>{dimension.score}%</strong>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.footer}>
        <p>
          Brighter, faster pathways indicate stronger current readiness—not a hidden intelligence score.
        </p>
        <p>
          Motion visualises measured readiness; it does not mean work is running. Measured{" "}
          {new Date(readiness.measuredAt).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" })}
        </p>
      </div>
    </section>
  );
}
