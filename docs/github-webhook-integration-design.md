# GitHub branch and pull-request automation design

## Summary

Waterfall will connect a GitHub repository to a Waterfall workspace and use a
shared issue identifier in a branch name to link GitHub activity to an issue.
For example, a pull request with head branch `feat/BAL-1-auth-page` links to
issue `BAL-1`. Configured status automations then move that issue to Code
Review when the pull request opens and to Done when it merges.

```text
Waterfall issue     GitHub branch                 GitHub event       Waterfall status
BAL-1            -> feat/BAL-1-auth-page      -> PR opened       -> Code Review
                                                      |
                                                      +-> PR merged -> Done
```

The recommended integration is a **GitHub App** installed by the Waterfall
user. It provides repository-scoped permissions, receives webhook deliveries
without retaining a user OAuth token, and continues working if the installing
user leaves the organization. GitHub OAuth may be supported for a simpler
initial connection flow, but it is not the preferred long-term model.

## Goals

- Detect Waterfall issue identifiers in GitHub branch names.
- Persist the association between a branch and an issue.
- Let users configure status automations rather than relying on status names.
- Transition linked issues for pull-request opened and merged events.
- Process webhook deliveries securely, idempotently, and with an audit trail.

## Non-goals for the first release

- Creating branches or pull requests from Waterfall.
- Syncing commits, reviews, comments, labels, or GitHub Issues.
- Inferring an issue from a pull-request title or description.
- Automatically moving an issue when a pull request is closed without merge.
- Supporting several Waterfall issues from one branch. A branch with more than
  one valid identifier is treated as ambiguous and does not automate status
  changes.

## Connection model

### Recommended: GitHub App

1. The Waterfall owner selects **Connect GitHub**.
2. Waterfall redirects them to install the GitHub App for selected personal or
   organization repositories.
3. GitHub redirects back to Waterfall with the installation ID.
4. Waterfall records the installation and its repositories.
5. The App subscribes to `create` and `pull_request` webhook events. Its
   webhook URL is the public Supabase Edge Function endpoint.

The App requires only repository metadata read access and pull-request read
access. It does not need write permission to GitHub. The app webhook secret and
private key live only in Supabase Edge Function secrets; neither is exposed to
the browser or stored in a client-accessible database row.

### OAuth fallback

An OAuth access token can create repository webhooks after the authorizing user
grants repository access and has repository administration rights. This is
useful for an early single-user implementation, but requires encrypted token
storage, webhook provisioning per repository, token-refresh/revocation
handling, and reauthorization when access changes. The event-processing and
data model below are the same for either connection type.

## Data model

All GitHub identifiers are stored as strings or bigint-compatible values so
they are never truncated. Database migrations should use `uuid` primary keys,
`timestamptz` timestamps, and `on delete cascade` only where noted below.

### `github_installations`

Represents one GitHub App installation (or, for OAuth fallback, one authorized
GitHub connection).

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `user_id` | Waterfall workspace owner; references `auth.users`. |
| `provider` | `github_app` or `github_oauth`. |
| `github_installation_id` | Unique GitHub App installation ID; nullable for OAuth. |
| `github_account_id`, `github_account_login`, `github_account_type` | Installing user or organization identity. |
| `status` | `active`, `suspended`, `revoked`, or `deleted`. |
| `created_at`, `updated_at` | Lifecycle timestamps. |

OAuth tokens, if supported, belong in a separate server-only secrets store or
an encrypted table protected from all browser roles. Do not place a token in
this table or return it from an RPC.

### `github_repositories`

Represents a GitHub repository that Waterfall may act on.

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `installation_id` | References `github_installations`. |
| `github_repository_id` | Immutable GitHub repository ID; unique. |
| `owner_login`, `name`, `full_name` | Display and lookup fields, e.g. `acme/waterfall`. |
| `is_active` | Lets a user disable a repository without removing its history. |
| `created_at`, `updated_at` | Lifecycle timestamps. |

Repository IDs, rather than repository names, are used to resolve webhook
payloads because names and owners can change.

### `github_issue_branches`

The durable link between one GitHub branch and one Waterfall issue.

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `repository_id` | References `github_repositories`. |
| `issue_id` | References `issues`. |
| `branch_name` | Exact Git ref without the `refs/heads/` prefix. |
| `first_seen_at`, `last_seen_at` | Observation timestamps. |
| `source` | `branch_created` or `pull_request`. |
| `is_deleted` | Set when a branch deletion event is later supported; do not delete audit history. |

Use a unique constraint on `(repository_id, branch_name)`. A branch can link to
only one issue in v1; a new conflicting match is recorded as an ignored webhook
delivery rather than replacing the original link.

### `issue_status_automations`

Adds the requested automation setting to Waterfall statuses. A row means,
“when this event occurs for a linked issue, move it to this status.” This fits
the existing user-owned `issue_statuses` model and avoids special handling for
the literal names “Code Review” and “Done.”

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `status_id` | Unique reference to `issue_statuses`; the target status. |
| `trigger` | `pull_request_opened` or `pull_request_merged`. |
| `enabled` | Defaults to `true`. |
| `created_at`, `updated_at` | Lifecycle timestamps. |

The unique `status_id` constraint makes each status a target for at most one
automation. The status editor presents this as a toggle and trigger selector:

- **Move issues here when a linked PR is opened** (usually Code Review)
- **Move issues here when a linked PR is merged** (usually Done)

Only one enabled automation per trigger may exist per user. Enforce this with a
partial unique index that joins status ownership through a denormalized
`user_id` column on this table, or enforce it transactionally in a
security-definer RPC. The UI must explain and replace the prior configured
target when a user selects a new one.

### `github_webhook_deliveries`

Stores enough data to deduplicate, diagnose, and retry webhook processing.

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `github_delivery_id` | Unique value from `X-GitHub-Delivery`. |
| `event_name`, `action` | For example `pull_request` and `opened`. |
| `repository_id` | Nullable internal repository reference when resolved. |
| `payload` | Raw JSON payload, access limited to server/admin roles. |
| `received_at`, `processed_at` | Timing fields. |
| `outcome` | `processed`, `ignored`, `failed`, or `duplicate`. |
| `reason`, `error` | Safe diagnostic text; never secrets. |

### `issue_automation_runs`

Provides user-visible audit history for every attempted status change.

| Column | Notes |
| --- | --- |
| `id` | Internal UUID primary key. |
| `issue_id`, `delivery_id` | References the affected issue and webhook delivery. |
| `trigger`, `from_status_id`, `to_status_id` | Status transition details. |
| `outcome`, `reason` | `applied`, `skipped`, or `failed`, plus context. |
| `created_at` | Audit timestamp. |

## Issue identifier and branch matching

For each candidate branch, normalize the matching identifier to uppercase and
look up the issue by the owning user’s project key and issue number:

```text
feat/BAL-1-auth-page  ->  BAL-1  ->  projects.key = BAL, issues.number = 1
```

The matcher accepts an identifier delimited by the start/end of the branch name
or common branch separators (`/`, `.`, `_`, `-`). A suitable case-insensitive
pattern is:

```text
(?:^|[\/._-])([A-Z][A-Z0-9]*)-([0-9]+)(?=$|[\/._-])
```

Examples:

| Branch | Result |
| --- | --- |
| `feat/BAL-1-auth-page` | Links `BAL-1`. |
| `bugfix/bal-42` | Links `BAL-42`; matching is case-insensitive. |
| `BAL-1` | Links `BAL-1`. |
| `feat/BAL-1-and-BAL-2` | Ambiguous; ignored in v1. |
| `feat/BAL-1a` | Does not match `BAL-1`; the numeric identifier is not delimited. |
| `feat/unknown-7` | Ignored because no accessible Waterfall issue exists. |

Resolution is restricted to projects owned by the same `user_id` as the GitHub
installation. This prevents a connected repository from changing another
Waterfall user’s issue simply because their project key happens to match.

## Webhook processing

The receiver is a Supabase Edge Function, for example:

```text
POST https://<project-ref>.supabase.co/functions/v1/github-webhook
```

It must be publicly callable by GitHub but configured without Supabase JWT
verification. The function itself—not an unauthenticated database client—uses
the Supabase service role for the tightly scoped processing transaction.

### Common receiver flow

1. Read the **unmodified raw request body**.
2. Verify `X-Hub-Signature-256` with the GitHub webhook secret using a
   constant-time HMAC SHA-256 comparison. Reject invalid signatures with 401.
3. Read `X-GitHub-Delivery`, `X-GitHub-Event`, and the payload action.
4. Insert the delivery with a unique `github_delivery_id`. If it already
   exists, return 200 without doing any work.
5. Resolve `repository.id` to an active `github_repositories` row. Ignore an
   unconnected or disabled repository.
6. Process only the event/action combinations below. Record all other valid
   deliveries as ignored.
7. Persist the final outcome and return a 2xx response. Unexpected failures
   are captured safely and returned as 5xx so GitHub can retry.

The delivery ID, not a payload hash, is the idempotency key. GitHub may retry a
delivery, and the status transition plus audit record must happen at most once.

### Branch-created event

For a `create` event where `ref_type` is `branch`:

1. Read `ref` as the branch name.
2. Match and resolve exactly one Waterfall issue.
3. Upsert `github_issue_branches` by repository and branch name.
4. Do not change issue status.

The receiver may also create the link later from a pull-request event. This
makes the feature resilient when the branch was created before the repository
was connected or a `create` delivery was missed.

### Pull request opened

For `pull_request` with action `opened`:

1. Use `pull_request.head.ref`, not the base branch, to resolve or backfill the
   branch link.
2. Find the enabled `pull_request_opened` automation for the installation
   owner.
3. If no matching link or no configured automation exists, record a skipped
   run and leave the issue unchanged.
4. If the issue is already in a `completed` or `cancelled` status group, skip
   it. Otherwise set `issues.status_id` to the automation target in the same
   transaction as the audit row.

### Pull request merged

For `pull_request` with action `closed` and `pull_request.merged = true`:

1. Resolve the issue using `pull_request.head.ref` and the durable branch link;
   fall back to identifier matching if no link exists yet.
2. Find the enabled `pull_request_merged` automation for the installation
   owner.
3. Skip a cancelled issue. If it is already in the target status, record an
   idempotent skipped run.
4. Otherwise update `issues.status_id` to the configured target. The existing
   `apply_issue_status` trigger sets `completed_at` when the target belongs to
   the `completed` status group.

The merged trigger should only be selectable for a status in the `completed`
group. Enforce that in the status-automation RPC and UI, ensuring a “Done”
automation cannot accidentally point to a non-terminal status.

## Transition rules and conflicts

- Manual status changes always remain available.
- A webhook never moves a cancelled issue.
- PR opened never reopens or overrides a completed issue.
- PR merged may move an active issue to its configured completed target.
- Reopening a merged pull request is out of scope; it does not reopen an issue.
- Multiple PRs from the same linked branch can generate delivery records, but
  only the first applicable transition changes status.
- A force-push or branch rename does not affect the established branch link in
  v1. Branch-rename support can be added later with a user-initiated repair or
  GitHub API reconciliation job.

## User experience

### GitHub connection settings

The project/workspace settings page shows connected GitHub accounts and their
repositories. Users can install, disconnect, or disable a repository. A
repository row shows the webhook connection health and the time of the last
successful delivery.

### Status settings

Each custom status has an **Automation** section:

```text
Code Review
  [x] Move linked issues here when a pull request is opened

Done
  [x] Move linked issues here when a pull request is merged
```

When a user enables a trigger already assigned to another status, Waterfall
asks whether to move that automation to the newly selected status. A status
with an enabled automation displays a small GitHub indicator in the workflow
editor.

### Issue activity

Issue activity displays a concise, attributable entry for an applied run, for
example: “GitHub automation moved this issue from In Progress to Code Review
after PR #42 opened in `acme/waterfall`.” Skipped and failed entries are kept
in the technical audit trail and need not clutter the default activity feed.

## Security and operational requirements

- Verify every request signature against the exact raw body before parsing or
  accessing the database.
- Keep GitHub App credentials, webhook secret, OAuth client secret, and any
  OAuth tokens in Supabase secrets or encrypted server-only storage.
- Do not use the browser’s Supabase client or user RLS session to process
  inbound webhook events.
- Apply RLS to all new tables. Users can read only installations, repositories,
  links, and automation history belonging to their workspace; webhook payloads
  are server/admin-only by default.
- Rate-limit the public receiver and cap retained payload size. Redact or
  expire raw payloads according to the application retention policy.
- Log delivery IDs, event/action, repository ID, resolved branch, issue ID,
  result, and error class. Never log signatures, access tokens, private keys,
  or webhook secrets.
- Treat GitHub’s 2xx response as acceptance only after the delivery is stored;
  return 5xx for transient database failures so GitHub retries.

## Implementation plan

1. Add a forward-only Supabase migration for the integration, repository,
   branch-link, status-automation, delivery, and automation-run tables,
   indexes, RLS policies, and server-only RPCs.
2. Add the GitHub App manifest/configuration and required Supabase Edge Function
   secrets. Configure `github-webhook` as a public function with JWT validation
   disabled.
3. Build the connection callback and repository selection/synchronization flow.
4. Implement signature verification, delivery deduplication, branch resolution,
   and atomic issue-status transition in the webhook function.
5. Add the status-editor automation controls and connection-health UI.
6. Add issue activity rendering and an admin-friendly delivery diagnostics view.
7. Test the cases below with GitHub’s webhook redelivery facility and a local
   signed-payload fixture suite.

## Acceptance tests

| Scenario | Expected result |
| --- | --- |
| `create` for `feat/BAL-1-auth-page` | A branch link to `BAL-1` is stored; status is unchanged. |
| Open PR from that branch with Code Review automation enabled | `BAL-1` moves to the configured Code Review status; one audit run exists. |
| Merge that PR with Done automation enabled | `BAL-1` moves to the configured Done status and receives `completed_at`. |
| Close PR without merge | `BAL-1` is unchanged. |
| Valid PR from an unconnected repository | No issue changes; delivery is ignored. |
| Valid payload with unknown or ambiguous issue identifier | No issue changes; delivery records why it was ignored. |
| Same `X-GitHub-Delivery` sent twice | The first delivery is processed once; the second is a no-op. |
| Invalid signature | Receiver returns 401; no database write occurs. |
| Open PR for a completed or cancelled issue | No issue status change; audit notes the skipped transition. |

## Open decisions

- Is a GitHub connection owned by an individual user as today’s schema implies,
  or should Waterfall introduce shared workspaces before the integration ships?
  The proposed tables follow the existing `user_id` ownership model.
- Should a single GitHub repository be allowed to link to several Waterfall
  projects owned by the same user? The identifier format supports it; the
  proposed resolver does so naturally as long as project keys are unique for
  that user.
- Should branch links appear on the issue detail page in v1, or only be stored
  for automation and exposed in activity history?
- Should an explicit “sync existing branches and open PRs” action be included
  when a repository is first connected? It is useful, but requires GitHub API
  pagination and is not necessary for webhook correctness.
