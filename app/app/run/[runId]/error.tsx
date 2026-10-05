"use client";

import { ErrorView } from "@/components/ui/ErrorView";

export default function RunError({ error }: { error: Error & { digest?: string } }) {
  return <ErrorView error={error} message="Something went wrong on this page. Your steps are saved. Reload to continue." />;
}
