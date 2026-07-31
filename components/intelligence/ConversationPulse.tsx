import { MessageSquare, ShieldCheck, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./IntelligenceMotion.module.css";

export type ConversationConnection = "connecting" | "live" | "recovering";

const CONNECTION_COPY: Record<ConversationConnection, { label: string; tone: "active" | "ready" | "attention" }> = {
  connecting: { label: "Connecting", tone: "active" },
  live: { label: "Live conversation", tone: "ready" },
  recovering: { label: "Polling backup active", tone: "attention" },
};

export function ConversationPulse({
  connection,
  messageCount,
  activityKey,
  reverse = false,
  description = "A live, shared conversation between the client and their team.",
}: {
  connection: ConversationConnection;
  messageCount: number;
  activityKey: string;
  reverse?: boolean;
  description?: string;
}) {
  const copy = CONNECTION_COPY[connection];

  return (
    <section
      className={styles.shell}
      aria-label={`Private team conversation. ${messageCount} message${messageCount === 1 ? "" : "s"}. ${copy.label}.`}
    >
      <div className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Conversation pulse</p>
          <h1 className={styles.title}>Messages</h1>
          <p className={styles.subtitle}>{description}</p>
        </div>
        <div className={styles.status} data-tone={copy.tone}>
          <span className={styles.statusDot} aria-hidden />
          {copy.label}
        </div>
      </div>

      <div className={`${styles.stage} ${styles.stageCompact} ${styles.conversation}`} data-connection={connection}>
        <span className={styles.ambient} aria-hidden />
        <svg
          className={styles.connections}
          viewBox="0 0 760 130"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path className={connection === "live" ? `${styles.path} ${styles.pathActive}` : styles.pathMuted} d="M 130 65 C 260 20, 500 110, 630 65" />
          <path className={connection === "live" ? styles.path : styles.pathMuted} d="M 130 65 C 260 110, 500 20, 630 65" />
        </svg>

        <div className={`${styles.smallCore} ${styles.personLeft}`} aria-hidden>
          <UsersRound />
          <strong>Client</strong>
        </div>

        <div className={`${styles.smallCore} ${styles.channelCore}`} aria-hidden>
          <MessageSquare />
          <strong>{messageCount}</strong>
        </div>

        <div className={`${styles.smallCore} ${styles.personRight}`} aria-hidden>
          <UsersRound />
          <strong>Team</strong>
        </div>

        {messageCount > 0 && (
          <span
            key={activityKey}
            className={cn(styles.messagePacket, reverse && styles.messagePacketReverse)}
            aria-hidden
          />
        )}
      </div>

      <p className={styles.privacy}>
        <ShieldCheck aria-hidden />
        Private team conversation · messages are not absorbed into the Company Brain
      </p>
    </section>
  );
}
