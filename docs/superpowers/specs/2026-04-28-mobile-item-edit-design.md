# Mobile Item Editing Design

## Goal
Allow the user to edit existing items from the deployed mobile app detail screen.

## Scope
- Edit title and content.
- Edit lane: `today`, `next`, `upcoming`, `backlog`.
- Edit status: `active` or `completed`.
- Edit priority through simple choices: High, Medium, Low.
- Edit tags through a comma-separated input stored in `metadata.tags`.

## Non-Goals
- No desktop UI changes.
- No raw priority slider.
- No new database columns.
- No delete/archive UI in this pass.

## Architecture
- Add `PATCH /api/mobile/items/[id]` to update allowed fields for the authenticated mobile user.
- Keep using the current item response shape: `id`, `title`, `content`, `created_at`, `priority_score`, `tags`, `type`, `status`, `lane`.
- Store tags in `metadata.tags` because the deployed database does not safely expose an `items.tags` column.
- Keep `status=completed` writes setting `completed_at`; switching back to active clears `completed_at`.

## Mobile UX
- The existing detail screen stays as the entry point.
- Add an `Edit` button in read mode.
- Edit mode shows title/content inputs, lane chips, status chips, priority chips, and tag input.
- `Save` calls the PATCH API and replaces local item state with the returned item.
- `Cancel` exits edit mode without saving.
- Save validation: title or content must contain non-whitespace text.

## Verification
- Unit/regression tests cover PATCH without using the missing `items.tags` column.
- Local checks: targeted test, full test suite, Next build, mobile typecheck, Expo web export.
- Deployed smoke covers opening a real item, saving edits, seeing the updated detail, and core Home/Backlog/API flows.
