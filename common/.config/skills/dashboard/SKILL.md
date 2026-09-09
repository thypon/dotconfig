---
name: dashboard
description: GitHub workload triage (PRs awaiting review, assigned issues, open PR status; org/me/pr modes). Use when user says "/dashboard", "check my reviews/PRs", "review backlog".
metadata:
  model: dynamic/small_model
policy-allow:
  - credential:api.github.com
policy-deny:
  - fs:write:.
  - fs:write:/tmp
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

Multiple args: process each separately.

## Buckets (for org and me modes)

1. **Waiting for others** — last comment by you. Skip.
2. **Actionable by you** — last comment by someone else (human), needs your input.
3. **Dependency updates** — PR authored by bot (dependabot, renovate, github-actions, socket-security). Lowest priority, separate table.
4. **Stale / closeable** — no activity 30+ days, or DO-NOT-SUBMIT in title.

## Time windows

- Recent: updated last 7 days
- Overdue: updated last 30 days (but not last 7)

Represent both in output, grouped.

## Step-by-step

### Step 1: Determine orgs and mode

```bash
# Parse args. If "me" → personal mode. If "pr" → PR mode. Else → org mode.
# Org mode: use explicit arg, else $DASHBOARD_ORGS, else "brave,brave-intl".
ORG=$(echo "${1:-${DASHBOARD_ORGS:-brave,brave-intl}}" | tr ',' ' ')
```

### Step 2: Fetch items

**Org mode**: fetch PRs + issues per org separately, then combine.

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

**Me mode**:

```bash
# Get personal repos
gh repo list --json nameWithOwner --limit 200 --jq '.[].nameWithOwner'

# For each personal repo, find issues assigned to you
for repo in $PERSONAL_REPOS; do
  gh issue list --repo "$repo" --assignee @me --state open \
    --json title,url,createdAt,updatedAt --limit 50
done
```

**PR mode**:

```bash
# Fetch your open PRs across all orgs
gh search prs --author=@me --state=open \
  --json title,url,repository,createdAt,updatedAt \
  --limit 100
```

#### Filter out archived repositories

After fetching, filter out items from archived repos. For each item, extract repo nameWithOwner and check:

```bash
# Check if a repo is archived (batched for all unique repos)
for repo in $(echo "$ALL_REPOS" | sort -u); do
  echo "$repo $(gh api "repos/$repo" --jq '.archived' 2>/dev/null || echo false)"
done
```

Discard items where repository archived. Archived repos = no active work, showing them adds noise.

### Step 3: Determine last commenter for each item

For each PR/issue, check both PR review comments and issue comments. Use most recent of all comment types.

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

**Issues**:

```bash
gh api "repos/$OWNER/$REPO/issues/$NUMBER/comments" \
  --jq '.[-1] | {user: .user.login, body: .body[:120], created_at: .created_at}'
```

Pick last activity across all comment types. No comments → actionable if PR, stale if old.

### Step 4: Classify into buckets

Per item, use last commenter:

| Last commenter | Bucket |
|----------------|--------|
| You (`thypon`) | **Waiting for others** — skip |
| Bot (`dependabot[bot]`, `renovate[bot]`, `github-actions[bot]`, `socket-security[bot]`, etc.) | **Dependency updates** — separate table |
| Anyone else (human) | **Actionable by you** |
| No comments | **Actionable by you** (or stale if >30d) |

For PRs: also check `state` from reviews — `CHANGES_REQUESTED` → highlight as "needs changes addressed", belongs to actionable bucket.

Special case: title contains `DO-NOT-SUBMIT` → **Stale / closeable** bucket.
No activity >60 days → **Stale / closeable** bucket.

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

Get `HEAD_SHA` from PR object's `headRefOid` field (GraphQL) or fetch PR details.

Classify CI state per PR:
- **Green** — all passing
- **Red** — failures exist
- **Pending** — still running
- **None** — no CI configured

### Step 6: For PR mode, check review status

From PR reviews endpoint (already fetched in Step 3), determine:

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

- **URL column**: verbatim `url` field from `gh search` JSON output — no markdown wrapping. Terminal auto-detects plain URLs as clickable.

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

- **URL column**: verbatim `url` field from API output — no markdown wrapping. Terminal auto-detects plain URLs.

### Recommendations section

At bottom, short `## Recommendations` section with concrete next steps:
- "Start with N actionable PRs: <links>"
- "Close M stale items: <links>"
- "Ping R reviewers on blocked PRs: <links>"

## Important constraints

- **DO NOT fetch issue/PR bodies** — title + URL + metadata only. Bodies waste tokens.
- **Limit comment body to 120 chars** when fetching last comment.
- **Batch parallel API calls** — fetch comments for all items in parallel, not sequentially.
- **Respect rate limits** — if item count >50, sample by most recent updatedAt first.
- **Do not repeat gh auth check** — assume authed.
- **Always include verbatim URL column** — paste raw `url` field from API output. Terminal auto-detects plain URLs as clickable.
- **Exclude archived repositories** — filter out any PR/issue whose repository `.archived == true`. Batch check for all unique repos upfront.

## OS-specific date commands

Use correct date command per platform:

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
