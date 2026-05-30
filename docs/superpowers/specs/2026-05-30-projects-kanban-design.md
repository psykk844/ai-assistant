# Projects Kanban Design

## Summary

Add a separate `Projects` tab to the existing app for project-specific task management. The current inbox/todo flow remains the place for random todos, links, notes, and AI-assisted capture. Project work stays isolated in the Projects module so it can be ordered and reviewed inside each project without leaking into Home, My Day, Backlog, link archiving, or Obsidian mirroring.

The v1 goal is a simple, fast, Trello-like experience on web and mobile for one user.

## Goals

- Provide a first-class `Projects` tab on web and mobile.
- Keep project tasks completely separate from existing inbox items.
- Support one nesting level: project task -> subtasks.
- Support checklist items on both tasks and subtasks.
- Use fixed board columns: `Backlog`, `To Do`, `Doing`, `Waiting`, `Done`.
- Allow manual task ordering inside each project column.
- Keep mobile interaction simple and reliable.

## Non-Goals

- No multi-user collaboration.
- No custom columns in v1.
- No unlimited nested tasks.
- No project tasks appearing in My Day, Home, or the existing Backlog.
- No AI classification for project tasks in v1.
- No Obsidian mirroring for project tasks in v1.
- No reminders, notifications, or calendar integrations in v1.
- No importing existing inbox todos into projects in v1.

## Recommended Approach

Build this as a separate Projects module inside the existing app, not as a separate app and not as metadata bolted onto the existing `items` table.

Reasoning:

- Separate tables keep project work isolated from the existing random-todo, link-processing, AI, and Obsidian behavior.
- Reusing the existing web/mobile app keeps deployment, auth, Supabase access, and styling consistent.
- A dedicated Projects surface makes the user model clear: random tasks go to the current app; project-specific work goes to Projects.

## Data Model

Suggested v1 entities:

- `projects`
  - `id`
  - `name`
  - `description`
  - `position`
  - `archived_at`
  - `created_at`
  - `updated_at`

- `project_tasks`
  - `id`
  - `project_id`
  - `parent_task_id` nullable; subtasks point to their parent task
  - `title`
  - `description`
  - `status` enum-like text: `backlog`, `todo`, `doing`, `waiting`, `done`
  - `position`
  - `due_date`
  - `labels` stored as structured JSON for v1
  - `archived_at`
  - `created_at`
  - `updated_at`

- `project_checklist_items`
  - `id`
  - `task_id`
  - `title`
  - `completed`
  - `position`
  - `created_at`
  - `updated_at`

Subtasks are rows in `project_tasks` with `parent_task_id` set. Only top-level tasks appear as kanban cards. Subtasks render inside their parent card preview and task detail.

## Web UX

Add `Projects` to the main web navigation.

The desktop layout should be Trello-like but aligned with the existing dark productivity design:

- Left project sidebar:
  - Project list
  - Manual ordering
  - Add project
  - Archive project

- Main board:
  - Active project title and lightweight controls
  - Fixed columns: `Backlog`, `To Do`, `Doing`, `Waiting`, `Done`
  - Compact task cards
  - Drag-and-drop between columns
  - Drag-and-drop ordering within a column
  - Fast add task per column

- Task cards show:
  - Title
  - Short description preview when present
  - Colored labels
  - Due date chip
  - Checklist progress
  - Subtask progress

- Task detail drawer:
  - Edit title, description, status, labels, and due date
  - Add, reorder, and complete checklist items
  - Add, reorder, and complete subtasks
  - Add checklist items to subtasks
  - Archive/delete task

Completion remains manual. Completing all checklist items or subtasks should not automatically move the parent task to `Done`.

## Mobile UX

Add `Projects` as a main mobile tab.

Mobile should prioritize fast review and simple edits:

- Project picker at the top.
- Horizontal status tabs for the fixed columns.
- Compact vertical task list for the selected project/status.
- Task detail screen or bottom sheet for editing.
- Status picker instead of drag-and-drop.
- Tap checkboxes for checklist items and subtasks.
- Fast add task in the current status.

Mobile v1 does not need column drag-and-drop. Manual ordering should use simple move controls, such as move up/down actions from a task overflow menu or detail screen.

## Search And Filters

V1 includes simple search within the current project.

Filters beyond search can wait. Label/due-date filters are useful later but not required for the first build.

## Error Handling

- Failed creates, edits, and moves should leave the local UI in a clear state and show a short failure message.
- Drag/drop changes on web can be optimistic, but failed persistence must rollback to the previous column/order.
- Mobile status changes should update immediately when possible and rollback on failure.
- Empty project and empty column states should support fast task creation.

## Performance

- Load only the selected project's active tasks by default.
- Keep archived projects/tasks out of the primary board query.
- Fetch detail data only when opening a task if board payload gets heavy.
- Use stable `position` values to avoid rewriting every task on small reorders when practical.

## Testing

Unit/integration coverage should include:

- Project CRUD helpers.
- Task CRUD helpers.
- Fixed status validation.
- Top-level task vs subtask behavior.
- Checklist progress calculation.
- Reorder behavior.
- Web optimistic move rollback.
- Mobile API contract for project board payloads.

Browser/mobile smoke coverage should include:

- Create project.
- Create task.
- Move task across columns on web.
- Add checklist item and mark complete.
- Add subtask and mark complete.
- Verify project tasks do not appear in existing Home/My Day/Backlog flows.

## Phasing

### Phase 1: Foundation

- Add database tables/migration.
- Add backend/data helpers.
- Add Projects tab shell on web.
- Add project list and board for fixed columns.
- Add task create/edit/move.

### Phase 2: Nested Work

- Add subtasks.
- Add checklist items for tasks and subtasks.
- Add progress indicators on cards.

### Phase 3: Mobile

- Add mobile Projects tab.
- Add project picker, status tabs, compact task list, and detail screen.
- Add create/edit/status/checklist/subtask actions.

### Phase 4: Polish

- Add simple project search.
- Add labels and due dates if not already included in earlier phases.
- Add archive/delete flows.
- Add browser/mobile smoke tests.

## Open Decisions

Defaults accepted for v1:

- Fixed columns.
- Separate project data from existing todos.
- One-level subtasks.
- Checklists on tasks and subtasks.
- Web drag-and-drop.
- Mobile status picker.
- Manual parent completion.
- Manual project and task ordering.
- Simple project search.
- No Obsidian or AI integration in v1.
