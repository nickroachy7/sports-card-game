import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-1">
          <span className="font-sans text-xl font-bold tracking-tight text-[var(--text)]">
            Draft Deck
          </span>
          <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">
            Fantasy baseball, collected
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
