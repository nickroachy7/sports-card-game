"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { completeOnboarding } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO_LIBRARY, type OnboardingInput, onboardingSchema } from "@/lib/contracts/profile";
import { cn } from "@/lib/utils";

const PRESET_PRIMARIES = ["#2A5CAA", "#C5322B", "#1F7A3D", "#D4A647", "#6E3BC4", "#E07A2B"];
const PRESET_SECONDARIES = ["#F5F1E8", "#1A1816", "#C9C3B5", "#8A8478", "#A57248", "#A8DDE2"];

type Step = 0 | 1 | 2;

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [pending, startTransition] = useTransition();

  const [teamName, setTeamName] = useState("");
  const [primaryColor, setPrimaryColor] = useState(PRESET_PRIMARIES[0]);
  const [secondaryColor, setSecondaryColor] = useState(PRESET_SECONDARIES[0]);
  const [logoId, setLogoId] = useState<(typeof LOGO_LIBRARY)[number]>(LOGO_LIBRARY[0]);

  function next() {
    if (step === 0) {
      const result = onboardingSchema.shape.teamName.safeParse(teamName);
      if (!result.success) {
        toast.error(result.error.issues[0]?.message ?? "Invalid team name.");
        return;
      }
    }
    if (step < 2) setStep((step + 1) as Step);
  }

  function back() {
    if (step > 0) setStep((step - 1) as Step);
  }

  async function submit() {
    const input: OnboardingInput = { teamName, primaryColor, secondaryColor, logoId };
    const parsed = onboardingSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    startTransition(async () => {
      const result = await completeOnboarding(parsed.data);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.push("/lineup");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Stepper current={step} total={3} />
      {step === 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-sans text-2xl font-bold tracking-tight">Name your team</h1>
            <p className="text-sm text-[var(--text-2)]">
              3–24 characters. Must be unique across Draft Deck.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="teamName">Team name</Label>
            <Input
              id="teamName"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Opening Day Outlaws"
              autoFocus
              maxLength={24}
            />
          </div>
          <Button onClick={next} disabled={!teamName}>
            Next
          </Button>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-sans text-2xl font-bold tracking-tight">Pick your colors</h1>
            <p className="text-sm text-[var(--text-2)]">
              They show up on your public profile and vault.
            </p>
          </div>

          <Preview
            primary={primaryColor}
            secondary={secondaryColor}
            teamName={teamName || "Your team"}
          />

          <div className="flex flex-col gap-2">
            <Label>Primary</Label>
            <ColorPalette
              options={PRESET_PRIMARIES}
              value={primaryColor}
              onChange={setPrimaryColor}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Secondary</Label>
            <ColorPalette
              options={PRESET_SECONDARIES}
              value={secondaryColor}
              onChange={setSecondaryColor}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={back} className="flex-1">
              Back
            </Button>
            <Button onClick={next} className="flex-1">
              Next
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-sans text-2xl font-bold tracking-tight">Choose a logo</h1>
            <p className="text-sm text-[var(--text-2)]">
              Placeholder set for launch. Custom uploads ship later.
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {LOGO_LIBRARY.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLogoId(id)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border-2 bg-[var(--surface)] text-xs font-medium transition-colors",
                  logoId === id
                    ? "border-[var(--text)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-3)] hover:border-[var(--text-2)]",
                )}
                aria-label={id}
              >
                {id.split("-")[0].slice(0, 3).toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={back} disabled={pending} className="flex-1">
              Back
            </Button>
            <Button onClick={submit} disabled={pending} className="flex-1">
              {pending ? "Creating…" : "Create team"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stepper({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length stepper
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i <= current ? "bg-[var(--text)]" : "bg-[var(--border)]",
          )}
        />
      ))}
    </div>
  );
}

function ColorPalette({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-10 w-10 rounded-full border-2 transition-transform",
            value === c
              ? "scale-110 border-[var(--text)]"
              : "border-[var(--border)] hover:scale-105",
          )}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function Preview({
  primary,
  secondary,
  teamName,
}: {
  primary: string;
  secondary: string;
  teamName: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] p-4"
      style={{
        background: `linear-gradient(180deg, ${primary} 0%, ${primary}CC 100%)`,
        color: secondary,
      }}
    >
      <span className="text-xs uppercase tracking-wider opacity-80">Preview</span>
      <span className="font-sans text-lg font-bold">{teamName}</span>
    </div>
  );
}
