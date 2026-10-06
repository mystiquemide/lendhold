"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/Notice";
import { Pill } from "@/components/ui/Pill";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, GENERIC_ERROR } from "@/lib/client/api";

/** Turns a reviewed plan into a run, then hands over to the run screen. */
export function RunStart({ planId }: { planId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ run: { id: string } }>("/api/runs", { method: "POST", body: JSON.stringify({ planId, path: "browser" }) })
      .then(({ run }) => router.replace(`/app/run/${run.id}`))
      .catch((err) => setError(err instanceof ApiError ? err.message : GENERIC_ERROR));
  }, [planId, router]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[560px]">
        <Notice tone="risk" action={<Pill variant="secondary" on="white" href="/app">Back to your stocks</Pill>}>
          {error}
        </Notice>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[560px]" aria-busy="true">
      <h1 className="sr-only">Starting</h1>
      <Skeleton className="h-[420px] rounded-panel bg-sheet!" />
    </div>
  );
}
