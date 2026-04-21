"use client";

import { useFormStatus } from "react-dom";

type ActionButtonProps = {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
};

export function ActionButton({ idleLabel, pendingLabel = "Working...", className }: ActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
