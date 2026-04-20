type Props = {
  title: string;
  phase: string;
  description?: string;
};

export function PagePlaceholder({ title, phase, description }: Props) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-12">
      <header className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
          Coming in {phase}
        </span>
        <h1 className="font-sans text-3xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
      </header>
      {description && <p className="max-w-prose text-[var(--text-2)]">{description}</p>}
      <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-3)]">
        Placeholder page. Landed as part of Milestone 3 (app shell).
      </div>
    </section>
  );
}
