"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? "Could not sign in.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090b0a] px-5 py-12 text-white">
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
        <Card className="w-full rounded-3xl bg-[#121512] py-7 shadow-2xl shadow-black/40 ring-white/10 sm:py-9">
          <CardHeader className="px-7 sm:px-9">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-[#c8a97e] text-[#11120f] shadow-lg shadow-[#c8a97e]/15">
              <LockKeyhole className="size-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a97e]">
              Restricted access
            </p>
            <CardTitle className="text-3xl tracking-tight">HLS Admin</CardTitle>
            <CardDescription className="mt-2 leading-6 text-white/50">
              Sign in with the administrator password to create monthly sheets
              and assign the duty team.
            </CardDescription>
          </CardHeader>

          <CardContent className="px-7 sm:px-9">
            <form onSubmit={handleSubmit} className="space-y-4">
            <Label htmlFor="admin-password">Admin password</Label>
            <div className="relative">
              <KeyRound
                className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35"
                aria-hidden="true"
              />
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                autoFocus
                required
                className="h-12 rounded-xl border-white/10 bg-black/25 pl-11 pr-4 placeholder:text-white/25 focus-visible:border-[#c8a97e]/70 focus-visible:ring-[#c8a97e]/15"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !password}
              className="h-12 w-full rounded-xl bg-[#c8a97e] font-semibold text-[#10110e] hover:bg-[#d4b98f]"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          </CardContent>
          <CardFooter className="justify-center border-0 bg-transparent px-7 pt-2 sm:px-9">
            <Button variant="link" asChild className="text-white/40 hover:text-white/70">
              <Link href="/">Back to HLS Planner</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
