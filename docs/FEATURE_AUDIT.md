# Feature Audit

## Implemented core features

- **Smart inbox capture** with AI classification into note / todo / link
- **Three priority lanes**: Today, Next Up, Backlog
- **Drag-and-drop prioritization** between lanes
- **Trash system** with restore and permanent delete
- **Completed / active / archived lifecycle**
- **Search** across saved content
- **AI chat** with answer citations and “convert to note”
- **Review queue** for low-confidence items
- **Detail panel editing** for title, content, type, lane, and review state
- **Keyboard shortcuts**
- **Theme toggle**
- **Widget view** for lighter quick access
- **Vault sync + Obsidian mirroring**

## Features discussed or implied that are partial / missing

### Partial
- **Subtasks**: there is AI-generated follow-up creation, but not a full parent/child task system
- **Import**: vault sync reads markdown knowledge, but there is no friendly bulk-import UI
- **Editing depth**: item editing exists, but not bulk edit / inline multi-select workflows
- **Related items**: some related-results plumbing exists, but discovery is still lightweight

### Missing
- **Bulk actions** (multi-select, batch archive, batch trash, batch retag)
- **Due dates / reminders / recurring items**
- **Tags / labels / richer metadata filtering**
- **Collaboration / sharing / comments**
- **Export tools** beyond the Obsidian mirror path

## Big saner.ai-style gaps

These are the biggest meaningful product gaps if you want this to feel closer to a saner.ai-style assistant:

1. **Dates + reminders** — currently the app helps prioritize, but not schedule
2. **Deeper AI actions** — rewrite, summarize, extract tasks, merge duplicates, digest backlog
3. **Threaded / persistent assistant workflows** — AI chat exists, but not deeper ongoing working memory
4. **Smart automations** — rules like “links go here” or “anything with deadline becomes urgent” are missing
5. **Advanced search and saved views** — search works, but not power-user filtering, saved searches, or timelines
6. **Relationship mapping** — no graph / backlink / concept-cluster view
7. **Inbox-zero workflows** — no snooze, defer, remind later, or weekly review assistant
8. **Multi-device/mobile-native capture** — widget exists, but there is no full mobile capture layer

## Short answer: are important features missing?

**Yes — but the core is already strong.**

Right now the app already has the backbone of a useful personal AI workspace:
- capture
- classify
- prioritize
- review
- search
- chat
- trash
- vault sync

The biggest missing layer is **time + automation + deeper AI assistance**.
That is the main difference between “smart board” and “true saner-style personal operating system.”
