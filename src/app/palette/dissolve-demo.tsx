"use client";

import { useState } from "react";

import { Card, type CardViewModel } from "@/components/card/Card";
import { DissolveCard } from "@/components/card/DissolveCard";

export function DissolveDemo({ card }: { card: CardViewModel }) {
  const [iteration, setIteration] = useState(0);
  const [dissolving, setDissolving] = useState(false);

  function handleClick() {
    if (dissolving) return;
    setDissolving(true);
  }

  function handleReset() {
    setDissolving(false);
    setIteration((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-start gap-6">
        <DissolveCard
          key={iteration}
          active={dissolving}
          onComplete={() => {
            // Stay dissolved; user hits reset to re-run.
          }}
        >
          <Card size="medium" card={card} />
        </DissolveCard>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleClick}
            disabled={dissolving}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Dissolve
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
