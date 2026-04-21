---
name: schema-loop-recovery
description: Use when apply_patch, edit, or write tools return schema or invalid-argument errors repeatedly during active implementation.
---

# Schema Loop Recovery

## Overview
When file-edit tools fail with schema-validation errors, switch immediately to deterministic bash/python writes to avoid stalled implementation loops.

## Protocol
1. Stop retrying the same broken tool payload.
2. Confirm required payload shape once.
3. If errors persist, switch to bash + python read/modify/write.
4. Record fallback activation in progress tracking.
5. Continue normal verification (lint/build/tests) after edits.

## Red Flags
- Repeating identical apply_patch payload after schema failure.
- Tool errors mentioning missing `patchText` or undefined `content`.
- Two consecutive schema failures across file-edit tools.

## Bash/Python Write Pattern
```bash
python3 - <<'PYWRITE'
from pathlib import Path
path = Path('/workspace/project/file.ts')
text = path.read_text()
text = text.replace('old', 'new')
path.write_text(text)
PYWRITE
```
