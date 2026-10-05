"use client";

import { ErrorView } from "@/components/ui/ErrorView";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return (
    <main id="main">
      <ErrorView error={error} message="Something went wrong on our side." />
    </main>
  );
}
