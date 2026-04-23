"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateTeamProfile } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOGO_LIBRARY,
  PRESET_PRIMARY_COLORS,
  PRESET_SECONDARY_COLORS,
  updateTeamProfileSchema,
} from "@/lib/contracts/profile";
import { cn } from "@/lib/utils";

type Props = {
  initialTeamName: string;
  initialPrimaryColor: string;
  initialSecondaryColor: string;
  initialLogoId: (typeof LOGO_LIBRARY)[number];
};

export function TeamSettingsForm({
  initialTeamName,
  initialPrimaryColor,
  initialSecondaryColor,
  initialLogoId,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [teamName, setTeamName] = useState(initialTeamName);
  const [primaryColor, setPrimaryColor] = useState(initialPrimaryColor);
  const [secondaryColor, setSecondaryColor] = useState(initialSecondaryColor);
  const [logoId, setLogoId] = useState<(typeof LOGO_LIBRARY)[number]>(initialLogoId);

  const dirty =
    teamName !== initialTeamName ||
    primaryColor !== initialPrimaryColor ||
    secondaryColor !== initialSecondaryColor ||
    logoId !== initialLogoId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = { teamName: teamName.trim(), primaryColor, secondaryColor, logoId };
    const parsed = updateTeamProfileSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input.");
      return;
    }
    startTransition(async () => {
      const res = await updateTeamProfile(parsed.data);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success("Team updated.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Live preview of the team identity — updates as the user
          edits fields. Mirrors what the header + card frames render. */}
      <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-full text-lg font-bold"
          style={{ backgroundColor: primaryColor, color: secondaryColor }}
        >
          {teamName.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-sans text-lg font-semibold text-[var(--text)]">
            {teamName || "Team name"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-3)]">
            Logo: {logoId}
          </span>
        </div>
      </div>

      {/* Team name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="teamName">Team name</Label>
        <Input
          id="teamName"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={24}
          required
        />
        <p className="text-xs text-[var(--text-3)]">3–24 characters. Must be unique.</p>
      </div>

      {/* Primary color */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--text)]">Primary color</legend>
        <div className="flex flex-wrap gap-2">
          {PRESET_PRIMARY_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={primaryColor.toLowerCase() === c.toLowerCase()}
              onClick={() => setPrimaryColor(c)}
            />
          ))}
          <HexColorInput value={primaryColor} onChange={setPrimaryColor} />
        </div>
      </fieldset>

      {/* Secondary color */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--text)]">Secondary color</legend>
        <div className="flex flex-wrap gap-2">
          {PRESET_SECONDARY_COLORS.map((c) => (
            <ColorSwatch
              key={c}
              color={c}
              active={secondaryColor.toLowerCase() === c.toLowerCase()}
              onClick={() => setSecondaryColor(c)}
            />
          ))}
          <HexColorInput value={secondaryColor} onChange={setSecondaryColor} />
        </div>
      </fieldset>

      {/* Logo */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--text)]">Logo</legend>
        <div className="grid grid-cols-5 gap-2">
          {LOGO_LIBRARY.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLogoId(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border p-2 transition-colors",
                logoId === id
                  ? "border-[var(--text)] bg-[var(--surface-2)]"
                  : "border-[var(--border)] hover:border-[var(--text-2)]",
              )}
            >
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-3)]">
                {id}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setTeamName(initialTeamName);
            setPrimaryColor(initialPrimaryColor);
            setSecondaryColor(initialSecondaryColor);
            setLogoId(initialLogoId);
          }}
          disabled={!dirty || pending}
        >
          Reset
        </Button>
        <Button type="submit" disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function ColorSwatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Pick color ${color}`}
      className={cn(
        "size-10 rounded-md border-2 transition-colors",
        active ? "border-[var(--text)]" : "border-[var(--border)] hover:border-[var(--text-2)]",
      )}
      style={{ backgroundColor: color }}
    />
  );
}

function HexColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 font-mono text-xs"
      aria-label="Custom hex color"
      placeholder="#FFFFFF"
    />
  );
}
