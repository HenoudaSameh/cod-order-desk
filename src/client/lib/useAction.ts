import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

/** Runs a change on the server, reloads the page's data, and reports a failure as a toast. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(
    work: () => Promise<unknown>,
    success?: string,
  ): Promise<boolean> {
    setBusy(true);
    try {
      await work();
      await router.invalidate();
      if (success) toast.success(success);
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

function errorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) return "That didn't work.";
  // Zod failures arrive as a JSON list of issues: show the first message.
  try {
    const issues = JSON.parse(cause.message) as { message?: string }[];
    if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  } catch {
    // A plain message.
  }
  return cause.message;
}
