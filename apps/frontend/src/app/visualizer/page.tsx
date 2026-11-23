"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/use-channels";
import {
  computePlanHash,
  loadWorkingPlan,
  saveWorkingPlan,
  type VisualizerBatch,
  type WorkingPlanState,
} from "@/lib/builder-batch";
import { PostVisualizer } from "@/components/post-visualizer";
import { WorkspaceBadge } from "@/components/workspace-badge";
import styles from "@/components/post-builder.module.css";

export default function VisualizerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { channels } = useChannels();
  const [plan, setPlan] = useState<WorkingPlanState>({
    matches: [],
    batches: [],
    confirmedAt: null,
    confirmedHash: null,
  });

  useEffect(() => {
    setPlan(loadWorkingPlan(user?.orgId));
  }, [user?.orgId]);

  const handleChangeBatches = (next: VisualizerBatch[]) => {
    const updated: WorkingPlanState = {
      ...plan,
      batches: next,
      confirmedAt: null,
      confirmedHash: null,
    };
    setPlan(updated);
    saveWorkingPlan(user?.orgId, updated);
  };

  const handleConfirmSequence = () => {
    const hash = computePlanHash(plan.batches);
    const updated: WorkingPlanState = {
      ...plan,
      confirmedAt: new Date().toISOString(),
      confirmedHash: hash,
    };
    setPlan(updated);
    saveWorkingPlan(user?.orgId, updated);
  };

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span className={styles.eyebrow}>Post Visualizer</span>
            <WorkspaceBadge compact />
          </div>
          <h1 className={styles.h1}>Preview &amp; sequence batches</h1>
          <p className={styles.subtitle}>
            Overlay staging batches by colour and cadence, adjust collisions or
            dates, and confirm your CSV export or send to Import Posts as drafts.
          </p>
        </div>
      </header>

      <PostVisualizer
        batches={plan.batches}
        onChangeBatches={handleChangeBatches}
        confirmedAt={plan.confirmedAt}
        confirmedHash={plan.confirmedHash}
        onConfirmSequence={handleConfirmSequence}
        channels={channels.map((c) => ({
          id: c.id,
          name: c.name,
          platform: c.platform,
          identifier: c.identifier,
        }))}
        pendingBatchDrafts={[]}
        pendingBatchLabel=""
        onAddPendingBatch={() => {}}
        onBackToBuilder={() => router.push("/builder")}
      />
    </section>
  );
}
