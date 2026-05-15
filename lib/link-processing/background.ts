import { processLinkBatch } from "./process-batch";
import { extractStandaloneUrl } from "./url";

const BACKGROUND_BATCH_LIMIT = 100;

type InsertedLinkCandidate = {
  id: string;
  content: string;
};

export function scheduleLinkProcessingForInsertedItems(items: InsertedLinkCandidate[]) {
  const standaloneCount = items.filter((item) => extractStandaloneUrl(item.content)).length;
  if (standaloneCount === 0) return;

  setTimeout(() => {
    processLinkBatch({ limit: BACKGROUND_BATCH_LIMIT }).catch((error) => {
      console.error("[link-processing] Background processing failed", error);
    });
  }, 0);
}
