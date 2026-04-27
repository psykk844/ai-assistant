# Mobile Live Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app publicly live and verify it end-to-end from a permanent HTTPS URL.

**Architecture:** Prefer the smallest deployable shape that works now: deploy the existing Next app for `/api/mobile/*`, and deploy or serve the Expo web mobile UI with `EXPO_PUBLIC_BACKEND_BASE_URL` pointed at the deployed backend. If one-app hosting is practical during implementation, use it; otherwise use two Coolify resources and give the user the phone UI URL.

**Tech Stack:** Next.js 14, Expo Router web, Supabase, Qdrant, OARS, Coolify.

---

### Task 1: Verify Deployable Inputs

**Files:**
- Read: `package.json`
- Read: `mobile/package.json`
- Read: `.env.local` and `mobile/.env` by variable name only

- [ ] Confirm required server env names exist locally or in global env.
- [ ] Confirm the mobile app changes are local and not yet in the remote deployment source.
- [ ] Decide whether deployment can use local artifact upload or needs a git commit/push.

**Verification:**
- Env presence check prints names/booleans only, no secret values.
- `git status --short` confirms deployment source state.

### Task 2: Build Locally Before Deployment

**Files:**
- Modify only if build or deploy packaging requires it.

- [ ] Run Next tests/build for `ai-assistant`.
- [ ] Run mobile typecheck/export or equivalent Expo web build command.
- [ ] Fix only blockers needed for a deployable public URL.

**Verification:**
- `npm test` passes or any failures are documented and triaged.
- `npm run build` passes for Next.
- Mobile web build/typecheck passes.

### Task 3: Publish Source or Artifact

**Files:**
- Potentially stage/commit/push local mobile/backend changes only after explicit approval if Git is required.

- [ ] If Coolify requires Git source, request commit/push approval because the deployable mobile work is not in remote yet.
- [ ] If artifact deployment is available, deploy without committing.
- [ ] Keep secrets out of Git and deployment logs.

**Verification:**
- Coolify sees a source/artifact containing the mobile UI and `/api/mobile/*` routes.

### Task 4: Deploy and Configure Coolify

**Files:**
- Coolify resource configuration only.

- [ ] Create/update Coolify resource(s).
- [ ] Set runtime env vars from `.env.local`, `mobile/.env`, and global env without printing values.
- [ ] Trigger deployment and poll until healthy.

**Verification:**
- Coolify reports healthy/running deployment.
- Public HTTPS URL is available.

### Task 5: End-to-End Public Verification

**Files:**
- Update `README_FIRST.md`, `HANDOFF.md`, and `progress.md` after verification.

- [ ] Probe `GET /api/mobile/home` with `x-mobile-dev-key`.
- [ ] Probe `GET /api/mobile/backlog?limit=5` with `x-mobile-dev-key`.
- [ ] Browser smoke the public phone UI URL.
- [ ] Record exact verification evidence and final URL.

**Verification:**
- Both API probes return 200.
- Browser smoke confirms visible mobile UI and no blank screen.
- User receives one phone URL plus any remaining caveats.
