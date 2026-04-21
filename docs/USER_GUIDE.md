# 🧠 Smart Inbox — User Guide

> Your personal AI-powered brain dump. Toss in thoughts, tasks, and links — the app sorts them for you.

---

## Table of Contents

1. [Logging In](#1-logging-in)
2. [The Big Picture — What You're Looking At](#2-the-big-picture--what-youre-looking-at)
3. [Dumping Stuff Into Your Inbox](#3-dumping-stuff-into-your-inbox)
4. [How the AI Sorts Your Stuff](#4-how-the-ai-sorts-your-stuff)
5. [The Three Lanes — Today / Next Up / Backlog](#5-the-three-lanes--today--next-up--backlog)
6. [What Each Item Card Shows You](#6-what-each-item-card-shows-you)
7. [Doing Stuff With Items](#7-doing-stuff-with-items)
8. [The Review Queue](#8-the-review-queue)
9. [Quick Filters (the counters up top)](#9-quick-filters-the-counters-up-top)
10. [Signing Out](#10-signing-out)

---

## 1. Logging In

When you open the app, you'll see a dark login screen.

| Field    | What to type |
|----------|-------------|
| Username | `sam`       |
| Password | `page`      |

Click **Sign in**. That's it — you're in.

> The button will say "Working..." for a second while it logs you in. If you type the wrong password, it'll show "Invalid credentials" in red.

Your login lasts **24 hours**. After that, you'll just need to sign in again.

---

## 2. The Big Picture — What You're Looking At

Once you're logged in, the screen is split into **three columns**:

```
┌──────────────┬─────────────────────────────────┬──────────────────┐
│              │                                 │                  │
│   LEFT       │         CENTER                  │    RIGHT         │
│   Sidebar    │         (Main Area)             │    Sidebar       │
│              │                                 │                  │
│  Your stats  │  Inbox box + your items         │  Your session    │
│  at a glance │  sorted into lanes              │  + review queue  │
│              │                                 │                  │
└──────────────┴─────────────────────────────────┴──────────────────┘
```

### Left Sidebar — Your Stats

Four little boxes that show counts at a glance:

- **Today** — how many things are high priority and need attention now
- **Next Up** — medium priority stuff coming up soon
- **Backlog** — everything else (lower priority, completed, or archived)
- **Review** — items the AI wasn't sure about (it's asking you to double-check)

### Center — Where the Action Happens

This is where you dump stuff in, and where all your items live sorted into lanes.

### Right Sidebar — Session & Review

Shows who's logged in (you!) with a sign-out button, plus a quick-glance list of items that need your review.

---

## 3. Dumping Stuff Into Your Inbox

Right at the top of the center area, you'll see a big text box that says:

> *"Drop a thought, task, or URL...*
> *Separate multiple items with a blank line."*

This is your **inbox composer**. Here's how to use it:

1. **Click the text box** and type literally anything:
   - A random thought: `"The sky looked amazing today"`
   - A task: `"Need to buy groceries tomorrow"`
   - A link: `"https://cool-article.com/something-neat"`
   - A question: `"Should I switch to a standing desk?"`

2. **Click "Add to inbox"**

3. The button changes to **"Classifying..."** for a moment — that's the AI figuring out what you just typed.

4. **Done!** Your item appears in one of the three lanes below.

> **Think of it like texting your future self.** Just brain-dump whatever's on your mind. The AI handles the rest.

### Bulk Adding — Multiple Items at Once

You can add **several items in one go**. Just put a **blank line** between each one:

```
Buy groceries tomorrow

Remember to call the dentist

https://cool-article.com/something-neat
This article was really interesting

The sky looked amazing today
```

That becomes **4 separate items**, each classified on its own:

| Chunk | AI reads it as |
|-------|---------------|
| `Buy groceries tomorrow` | ✅ Todo |
| `Remember to call the dentist` | ✅ Todo |
| `https://cool-article.com/...` + next line | 🔗 Link |
| `The sky looked amazing today` | 📝 Note |

**How it works:**
- A **blank line** (hit Enter twice) tells the app: *"that's where one item ends and the next one begins."*
- Lines that are right next to each other (single Enter) stay **together** as one item — handy for a link + its description.
- The button live-updates to show **"Add 4 items"** so you can see how many it detected before you submit.
- While saving, it shows **"Classifying 4 items..."** — all items are classified in parallel so it's fast.
- If you only type one thing with no blank lines, it works exactly like before — just one item.

---

## 4. How the AI Sorts Your Stuff

When you add something, the AI looks at what you typed and makes three decisions:

### What type is it?

| Type | How the AI decides | Badge color |
|------|-------------------|-------------|
| **📝 Note** | General thoughts, observations, ideas | Green |
| **✅ Todo** | Starts with "need to," "remember to," "should," "must," or has a "?" | Blue |
| **🔗 Link** | Contains a URL (like `https://...`) | Purple |

### How important is it?

The AI gives each item a **priority score** from 0–100%. Higher = more urgent. This decides which lane it goes into (more on that below).

### How confident is the AI?

The AI also gives itself a **confidence score**. If it's below 75%, the item gets flagged for your review (a little amber "review" badge appears). This is the AI saying *"Hey, I wasn't super sure about this one — mind double-checking?"*

---

## 5. The Three Lanes — Today / Next Up / Backlog

Your items automatically sort into three lanes based on priority:

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    🔴 TODAY      │  │   🟡 NEXT UP     │  │   ⚪ BACKLOG     │
│                 │  │                 │  │                 │
│  Priority 80%+  │  │  Priority 60-79% │  │  Everything else │
│                 │  │                 │  │  + completed     │
│  "Do this now"  │  │  "Do this soon"  │  │  + archived      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- **Today** = High priority (80%+). The AI thinks these need your attention right now.
- **Next Up** = Medium priority (60–79%). Important but not urgent.
- **Backlog** = Everything else — low priority stuff, completed tasks, and archived items all live here.

Each lane header shows how many items are in it, like **"Today (3)"**.

If a lane is empty, it just says *"No items in this lane."*

---

## 6. What Each Item Card Shows You

Every item in a lane looks like a small card. Here's what's on it:

```
┌─────────────────────────────────────────────┐
│  [todo]  [today]  [review]    P85 · C92     │
│                                             │
│  Buy groceries tomorrow                     │
│  Need to buy groceries tomorrow, especially │
│  milk and eggs...                           │
│                                             │
│  [Complete]  [Archive]  [Mark reviewed]     │
└─────────────────────────────────────────────┘
```

Breaking that down:

| Part | What it means |
|------|--------------|
| **Type badge** (blue/purple/green) | Whether it's a todo, link, or note |
| **Lane badge** | Which lane it's in (today / next up / backlog) |
| **Review badge** (amber) | Only shows if the AI wants you to check this one |
| **P85** | Priority score — 85% important |
| **C92** | Confidence score — the AI is 92% sure it categorized this right |
| **Title** (bold) | A short title (auto-generated from what you typed) |
| **Content preview** | First couple lines of what you typed |
| **Action buttons** | Things you can do with this item (see below) |

---

## 7. Doing Stuff With Items

Each item card has buttons at the bottom. Which buttons you see depends on the item's current status:

### ✅ Complete

*"I did this!"*

Click **Complete** to mark a task as done. The button shows "Completing..." briefly. The item moves to the Backlog lane (since it's no longer active).

### 🔄 Reopen

*"Wait, I'm not done with this after all."*

Shows up on completed or archived items. Click **Reopen** to bring it back to active status. It'll pop back into whichever lane matches its priority.

### 📦 Archive

*"I don't need this anymore, but don't delete it."*

Click **Archive** to tuck it away. It moves to Backlog. You can always reopen it later.

### 👁️ Mark Reviewed

*"I checked this and the AI got it right."*

Only shows up on items with the amber "review" badge. Click it to clear the review flag. This tells the system you're happy with how the AI categorized it.

> **All actions give you a little loading state** (the button text changes to "Completing..." or "Archiving..." etc.) so you know it's working.

---

## 8. The Review Queue

On the **right sidebar**, below your session info, there's a **Review Queue** panel.

This shows up to **8 items** that the AI wasn't confident about (confidence below 75%).

Each item in the review queue shows:
- The item title
- A 2-line preview of the content
- An amber/gold highlight so it stands out

> **Think of it as the AI raising its hand and saying:** *"Hey, I sorted these but I'm not 100% sure I got them right. Want to take a look?"*

To handle review items, find them in the main lanes and click **"Mark reviewed"** to clear the flag.

When all reviews are handled, the panel says: *"No low-confidence items pending review."*

---

## 9. Quick Filters (the Counters Up Top)

Just above the three lanes, you'll see a row of **6 filter chips** that show counts:

| Chip | What it counts |
|------|---------------|
| **Active** | Items you're still working with |
| **Completed** | Items you've marked done |
| **Archived** | Items you've put away |
| **Links** | All items that are URLs/links |
| **Todos** | All items that are tasks |
| **Notes** | All items that are general thoughts |

> These are **display-only counters** — they give you a quick snapshot of what's in your inbox at a glance. Think of them as a mini dashboard.

---

## 10. Signing Out

In the **right sidebar** at the top, you'll see:

- Your username (**sam**)
- A **Sign out** button

Click it and you're logged out. You'll be sent back to the login screen.

---

## Quick Reference — The 30-Second Version

1. **Log in** with `sam` / `page`
2. **Type anything** into the big text box and hit "Add to inbox"
   - Add multiple items at once by separating them with **blank lines**
3. The AI **auto-sorts** it into Today, Next Up, or Backlog
4. **Complete** tasks when done, **Archive** stuff you don't need
5. Check the **Review Queue** when the AI isn't sure about something
6. **Sign out** when you're done

That's literally it. Brain dump → AI sorts → you act on it. 🎯
