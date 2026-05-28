# Link Cleanup And Monthly Archive Design

Date: 2026-05-28

## Goal

Keep the app free of standalone URL-only posts while preserving mixed text-plus-link items for manual user processing. Processed standalone links must be archived as Obsidian notes under monthly folders such as `Links/2026-05/`.

## User Rules

- If an app item is only a link and nothing else, it should not stay in the app after processing.
- If an app item has a link plus accompanying text, it stays in the app until the user manually processes it.
- Mixed text-plus-link items should not create active Obsidian mirror files.
- Archived standalone link summaries belong under the monthly `Links/YYYY-MM/` structure.

## Current Behavior

- The link batch job already identifies standalone URL-only content via `extractStandaloneUrl`.
- The link archive writer already saves success and failure notes under `Links/YYYY-MM/`.
- Active app link mirrors currently write to root `Links/`, which creates clutter for items that are still active in the app.

## Proposed Behavior

1. Keep `processLinkBatch` strict: only standalone URL-only items are eligible for automated archiving and deletion.
2. Keep successful and failed archive notes under `Links/YYYY-MM/`.
3. Stop mirroring active `link` items into Obsidian. This applies especially to mixed text-plus-link items that remain in the app.
4. Continue mirroring active todos and notes as before.
5. Run the production link job after deployment until no active standalone URL-only items remain.

## Architecture

### Link Processing

`lib/link-processing/process-batch.ts` remains the source of truth for automated URL-only cleanup. It should continue to use `extractStandaloneUrl`, which only matches content that is exactly one URL after trimming. This prevents mixed notes from being deleted automatically.

### Monthly Archive Notes

`lib/link-processing/obsidian.ts` remains the source of truth for processed link archive notes. It already resolves archive targets with `Links/<YYYY-MM>/`, based on the processing timestamp.

### Active Obsidian Mirrors

`lib/obsidian/mirror.ts` should skip mirroring items where `item.type === "link"`. That keeps active mixed-link app items out of root `Links/` and prevents duplicate link storage before manual processing.

## Data Flow

1. User saves an app item.
2. If it is a todo or note, it continues to mirror into Obsidian.
3. If it is a link item, no active mirror file is written.
4. The scheduled or manual link job scans active items.
5. If content is exactly a standalone URL, the job extracts/summarizes/falls back as needed.
6. The job writes a monthly archive note under `Links/YYYY-MM/`.
7. The job records the processed URL and deletes the original app item only after the archive note and registry record succeed.
8. If content has text plus a URL, the job skips it and leaves it in the app.

## Error Handling

- If extraction or summarization fails in a non-retryable way, write a failure note under `Links/YYYY-MM/`, record it, and delete the standalone URL-only app item.
- If note writing or registry insertion fails, keep the original app item so data is not lost.
- If duplicate standalone links are found, delete only the duplicate app item after confirming the URL was already processed.

## Testing

- Unit test that `mirrorItemToObsidian` returns `null` and does not write files for `type: "link"` items.
- Keep or add coverage confirming todo and note mirrors still write normally.
- Existing link-processing tests should continue proving standalone URL-only items are archived into `Links/YYYY-MM/` and deleted.
- Run full verification after implementation: tests, lint, build, TypeScript check, and a production smoke pass after deployment.

## Production Cleanup

After deployment:

1. Run the protected `POST /api/jobs/process-links` endpoint repeatedly with a safe batch limit until active standalone URL-only candidates are exhausted.
2. Verify active mixed text-plus-link items still exist in the app.
3. Verify processed/failure notes exist under monthly `Links/YYYY-MM/` folders.
4. Verify no new root `Links/` mirror files are created for mixed-link app items.

## Out Of Scope

- Automatically processing mixed text-plus-link items.
- Moving existing mixed-link root mirror files unless a separate cleanup step is explicitly approved.
- Changing the visual app UI.
- Changing the Quatarly AI provider configuration.
