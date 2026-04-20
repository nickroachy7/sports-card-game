"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { signInWithOAuth, signInWithPassword, signUpWithPassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Mode = "signin" | "signup";

export function AuthForm({ mode, redirectTo }: { mode: Mode; redirectTo?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [oauthPending, setOauthPending] = useState<null | "google" | "apple">(null);

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      if (redirectTo) formData.set("redirectTo", redirectTo);
      const action = mode === "signin" ? signInWithPassword : signUpWithPassword;
      const result = await action(formData);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  async function handleOAuth(provider: "google" | "apple") {
    setOauthPending(provider);
    const result = await signInWithOAuth(provider);
    if (!result.ok) {
      toast.error(result.error.message);
      setOauthPending(null);
      return;
    }
    window.location.href = result.data.url;
  }

  const primaryLabel = mode === "signin" ? "Sign in" : "Create account";
  const heading = mode === "signin" ? "Welcome back" : "Create your team";
  const sub =
    mode === "signin"
      ? "Sign in to manage your lineup and collect cards."
      : "All you need is an email and a password.";

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-sans text-2xl font-bold tracking-tight text-[var(--text)]">
          {heading}
        </h1>
        <p className="text-sm text-[var(--text-2)]">{sub}</p>
      </div>

      <form action={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
          />
        </div>
        <Button type="submit" disabled={pending || oauthPending !== null} className="mt-2">
          {pending ? "…" : primaryLabel}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wider text-[var(--text-3)]">or</span>
        <Separator className="flex-1" />
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuth("google")}
          disabled={pending || oauthPending !== null}
        >
          {oauthPending === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleOAuth("apple")}
          disabled={pending || oauthPending !== null}
        >
          {oauthPending === "apple" ? "Redirecting…" : "Continue with Apple"}
        </Button>
      </div>

      <p className="text-center text-sm text-[var(--text-2)]">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <a
              href="/signup"
              className="font-medium text-[var(--text)] underline-offset-4 hover:underline"
            >
              Create an account
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a
              href="/signin"
              className="font-medium text-[var(--text)] underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </>
        )}
      </p>
    </div>
  );
}
