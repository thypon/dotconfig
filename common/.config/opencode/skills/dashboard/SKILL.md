---
name: dashboard
description: >
  GitHub workload dashboard. Shows PRs awaiting review, assigned issues, and open PRs
  with last-commenter triage to identify blocking items. Splits into actionable, waiting-on-others,
  and dependency-update buckets. Supports org mode (default: brave,brave-intl), me mode (personal repos),
  and pr mode (your PRs with CI status).
  Use when user says "/dashboard", "show dashboard", "check my reviews", "check my PRs",
  "what's on my plate", "review backlog".
---

# Dashboard

Show GitHub workload triaged by actionability. Default: `brave` and `brave-intl` orgs.
Set `DASHBOARD_ORGS=org1,org2` env var to override. Explicit argument overrides both.

## Modes

| Command | Behavior |
|---------|----------|
| `/dashboard` | Dashboard for default orgs (`brave`, `brave-intl`) |
| `/dashboard brave` | Dashboard for `brave` org only |
| `/dashboard me` | Dashboard for personal repos of authed user |
| `/dashboard pr` | Open PRs authored by you, with CI status |

If multiple args, process each separately.

## Buckets (for org and me modes)

1. **Waiting for others** — last comment by you. Skip these.
2. **Actionable by you** — last comment by someone else (human), needs your input.
3. **Dependency updates** — PR authored by bot (dependabot, renovate, github-actions, socket-security). Lowest priority, separate table.
4. **Stale / closeable** — no activity in 30+ days, or DO-NOT-SUBMIT in title.

## Time windows

- Recent: updated in last 7 days
- Overdue: updated in last 30 days (but not in last 7)

Represent both in output, grouped.

## Step-by-step

### Step 1: Determine orgs and mode

```bash
# Parse args. If "me" → personal mode. If "pr" → PR mode. Else → org mode.
# Org mode: use explicit arg, else $DASHBOARD_ORGS, else "brave,brave-intl".
ORG=$(echo "${1:-${DASHBOARD_ORGS:-brave,brave-intl}}" | tr ',' ' ')
```

### Step 2: Fetch items

For **org mode**, fetch PRs and issues for each org separately, then combine.

#### PRs requesting your review

```bash
for org in $ORGS; do
  gh search prs --review-requested=@me --state=open \
    --owner="$org" \
    --json title,url,repository,createdAt,updatedAt,author \
    --limit 100
done
```

#### Issues assigned to you

```bash
for org in $ORGS; do
  gh search issues --assignee=@me --state=open \
    --owner="$org" \
    --json title,url,repository,createdAt,updatedAt \
    --limit 100
done
```

For **me mode**:

```bash
# Get personal repos
gh repo list --json nameWithOwner --limit 200 --jq '.[].nameWithOwner'

# For each personal repo, find issues assigned to you
for repo in $PERSONAL_REPOS; do
  gh issue list --repo "$repo" --assignee @me --state open \
    --json title,url,createdAt,updatedAt --limit 50
done
```

For **pr mode**:

```bash
# Fetch your open PRs across all orgs
gh search prs --author=@me --state=open \
  --json title,url,repository,createdAt,updatedAt \
  --limit 100
```

### Step 3: Determine last commenter for each item

For each PR or issue, check both PR review comments and issue comments.
Use the most recent of all comment types.

```bash
# For a PR at repos/OWNER/REPO/pulls/NUMBER:
# 1. Review comments
gh api "repos/$OWNER/$REPO/pulls/$NUMBER/comments" \
  --jq '.[-1] | {user: .user.login, body: .body[:120], created_at: .created_at}'

# 2. Issue comments (PRs also have issue comments)
gh api "repos/$OWNER/$REPO/issues/$NUMBER/comments" \
  --jq '.[-1] | {user: .user.login, body: .body[:120], created_at: .created_at}'

# 3. Reviews (approval/changes)
gh api "repos/$OWNER/$REPO/pulls/$NUMBER/reviews" \
  --jq '.[-1] | {user: .user.login, state: .state, submitted_at: .submitted_at}'
```

For **issues**:

```bash
gh api "repos/$OWNER/$REPO/issues/$NUMBER/comments" \
  --jq '.[-1] | {user: .user.login, body: .body[:120], created_at: .created_at}'
```

Pick the last activity across all comment types. If no comments exist, treat as "no comments" → actionable if PR, stale if old.

### Step 4: Classify into buckets

For each item, use the last commenter:

| Last commenter | Bucket |
|----------------|--------|
| You (`thypon`) | **Waiting for others** — skip |
| Bot (`dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`, `socket-security[bot]`, etc.) | **Dependency updates** — separate table |
| Anyone else (human) | **Actionable by you** |
| No comments | **Actionable by you** (or stale if >30d) |

For PRs: also check if `state` from reviews is `CHANGES_REQUESTED` → highlight as "needs changes addressed", belongs to actionable bucket.

Special case: if title contains `DO-NOT-SUBMIT` → put in **Stale / closeable** bucket.
If no activity in >60 days → put in **Stale / closeable** bucket.

### Step 5: For PR mode, check CI status

For each PR authored by you:

```bash
# Combined status
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/status" \
  --jq '{state: .state, total: .total_count}'

# OR check runs (more granular)
gh api "repos/$OWNER/$REPO/commits/$HEAD_SHA/check-runs" \
  --jq '.check_runs | group_by(.conclusion) | map({conclusion: .[0].conclusion, count: length})'
```

Get `HEAD_SHA` from the PR object's `headRefOid` field (GraphQL) or fetch PR details.

For each PR, classify CI state:
- **Green** — all passing
- **Red** — failures exist
- **Pending** — still running
- **None** — no CI configured

### Step 6: For PR mode, check review status

From the PR's reviews endpoint (already fetched in Step 3), determine:

| Review state | Meaning |
|--------------|---------|
| No reviews yet | Needs reviewers assigned / ping |
| `CHANGES_REQUESTED` | You need to push fixes |
| `APPROVED` but not merged | Ready to merge, check CI |
| `COMMENTED` only | Waiting for re-review or merge |
| `DISMISSED` | Reviewer left, new review needed |

### Step 7: Output format

#### For org/me modes:

```markdown
## Dashboard — $MODE ($ORGS)
*Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)*

### Actionable by You (needs your input — last 7 days)

| # | Repo | Title | URL | Last activity | Last by |
|---|------|-------|-----|---------------|---------|
| 1 | owner/repo | Title | https://github.com/owner/repo/issues/N | YYYY-MM-DD | username |

### Actionable by You (overdue — 7-30 days)

| # | Repo | Title | URL | Last activity | Last by |
|---|------|-------|-----|---------------|---------|

### Waiting for Others (last comment = you)

| # | Repo | Title | URL | Waiting on |
|---|------|-------|-----|------------|

### Dependency Updates (bot PRs)

| # | Repo | Title | URL | Bot | Status |
|---|------|-------|-----|-----|--------|

### Stale / Closeable

| # | Repo | Title | URL | Last activity | Reason |
|---|------|-------|-----|---------------|--------|
```

- **URL column**: Use the verbatim `url` field from `gh search` JSON output — no markdown wrapping. Terminal auto-detects plain URLs as clickable.

```

#### For PR mode:

```markdown
## Your Open PRs
*Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)*

### Needs Your Action

| # | Repo | Title | URL | CI | Reviews | Last activity |
|---|------|-------|-----|----|---------|---------------|

### Waiting for Reviewers

| # | Repo | Title | URL | CI | Reviews | Last activity |
|---|------|-------|-----|----|---------|---------------|

### Approved / Ready to Merge

| # | Repo | Title | URL | CI | Reviews | Last activity |
|---|------|-------|-----|----|---------|---------------|

### Stale

| # | Repo | Title | URL | CI | Last activity | Reason |
|---|------|-------|-----|----|---------------|--------|
```

- **URL column**: Use verbatim `url` field from API output — no markdown wrapping. Terminal auto-detects plain URLs.

### Recommendations section

At the bottom, add a short `## Recommendations` section with concrete next steps:
- "Start with N actionable PRs: <links>"
- "Close M stale items: <links>"
- "Ping R reviewers on blocked PRs: <links>"

## Important constraints

- **DO NOT fetch issue/PR bodies** — title + URL + metadata only. Bodies waste tokens.
- **Limit comment body to 120 chars** when fetching last comment.
- **Batch parallel API calls** — fetch comments for all items in parallel, not sequentially.
- **Respect rate limits** — if item count >50, sample by most recent updatedAt first.
- **Do not repeat gh auth check** — assume authed.
- **Always include verbatim URL column** — paste the raw `url` field from API output. Terminal auto-detects plain URLs as clickable.

## OS-specific date commands

The agent should use the correct date command for the platform:

**macOS:**
```bash
date -v-7d +%Y-%m-%d   # 7 days ago
date -v-30d +%Y-%m-%d  # 30 days ago
```

**Linux:**
```bash
date -d '7 days ago' +%Y-%m-%d
date -d '30 days ago' +%Y-%m-%d
```

Detect platform with `uname -s` (Darwin = macOS, Linux = Linux).
