import { describe, expect, it } from "vitest";
import { mergeChecklistTitleDrafts } from "@/lib/projects/checklist-drafts";

describe("project checklist title drafts", () => {
  it("keeps a fresh edit after a saved checklist item refreshes", () => {
    const items = [
      { id: "checklist-1", title: "Saved once" },
      { id: "checklist-2", title: "Untouched" },
    ];

    const drafts = mergeChecklistTitleDrafts(
      items,
      {
        "checklist-1": "Editing again",
        "checklist-2": "Old untouched draft",
        "removed-item": "Remove me",
      },
      new Set(["checklist-1"]),
    );

    expect(drafts).toEqual({
      "checklist-1": "Editing again",
      "checklist-2": "Untouched",
    });
  });
});
