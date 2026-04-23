"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRecurrence } from "./actions";
import type { RecurrenceConfig } from "@/lib/items/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface RecurrencePickerProps {
  itemId: string;
  currentRecurrence?: RecurrenceConfig | null;
}

export function RecurrencePicker({ itemId, currentRecurrence }: RecurrencePickerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [frequency, setFrequency] = useState<"daily" | "weekly" | null>(
    currentRecurrence?.is_template ? (currentRecurrence.frequency ?? null) : null
  );
  const [days, setDays] = useState<number[]>(currentRecurrence?.days ?? []);

  const handleChange = (newFreq: "daily" | "weekly" | null) => {
    setFrequency(newFreq);
    startTransition(async () => {
      await setRecurrence(itemId, newFreq, newFreq === "weekly" ? days : undefined);
      router.refresh();
    });
  };

  const toggleDay = (day: number) => {
    const newDays = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    setDays(newDays);
    if (frequency === "weekly") {
      startTransition(async () => {
        await setRecurrence(itemId, "weekly", newDays);
        router.refresh();
      });
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm text-[var(--text-muted)]">Repeat</span>
      <div className="flex gap-2">
        {(["daily", "weekly", null] as const).map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => handleChange(opt)}
            disabled={isPending}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors duration-140 ${
              frequency === opt
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {opt === null ? "Off" : opt === "daily" ? "🔄 Daily" : "🔄 Weekly"}
          </button>
        ))}
      </div>
      {frequency === "weekly" && (
        <div className="flex gap-1 flex-wrap">
          {DAY_LABELS.map((label, idx) => {
            const dayNum = idx + 1;
            const isSelected = days.includes(dayNum);
            return (
              <button
                key={dayNum}
                type="button"
                onClick={() => toggleDay(dayNum)}
                disabled={isPending}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors duration-140 ${
                  isSelected
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-muted)] text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
