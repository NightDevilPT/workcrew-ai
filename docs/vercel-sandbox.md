# Vercel Sandbox — Reference & Fit Check

_Part of the Workcrew AI documentation set in `docs/`, per the documentation rule in [AGENTS.md](../AGENTS.md). This is a learning/reference doc on [Vercel Sandbox](https://vercel.com/docs/sandbox/working-with-sandbox), evaluated as a possible `production` implementation of the Runner Adapter defined in [tech-stack.md §3.2](./tech-stack.md#32-runner-adapter-sandboxed-code-execution). No decision has been made yet — see [overview.md §11, Open Decisions](./overview.md#11-open-decisions)._

## 1. What it is

Vercel Sandbox is a hosted, isolated compute environment (Firecracker micro-VM based) that your code creates, runs commands in, and tears down — via an SDK (`@vercel/sandbox`) or CLI. It is **not** tied to deploying your app on Vercel: any Node.js process, anywhere, can call the SDK as long as it has Vercel credentials.

Key properties:

- **Persistent by default** — stopping a sandbox snapshots its filesystem; resuming restores it. Pass `persistent: false` for throwaway runs.
- **Git-aware** — can create a sandbox directly from a Git source (public or private repo, with a token).
- **Managed or custom images** — ships common languages/tools out of the box, or boot your own image from Vercel Container Registry.
- **Snapshots** — save a prepared environment (deps installed) so future sandboxes start warm.

## 2. How it maps to our Runner Adapter

Our Runner Adapter interface (tech-stack.md §3.2) is:

```ts
interface RunnerAdapter {
	prepare(context: RunContext): Promise<void>;
	execute(step: Step): Promise<StepResult>;
	snapshot(): Promise<Snapshot>;
	cleanup(): Promise<void>;
}
```

Vercel Sandbox's SDK lines up closely:

| Our contract        | Vercel Sandbox call                                                    |
| :------------------- | :----------------------------------------------------------------------- |
| `prepare(context)`  | `Sandbox.create({ source: { type: 'git', url, username, password } })` — clones the bound repo in directly |
| `execute(step)`     | `sandbox.runCommand(...)` (or `detached: true` + `.logs()` for streaming) |
| `snapshot()`        | `sandbox.snapshot({ expiration })`                                       |
| `cleanup()`         | `sandbox.stop()` (keeps it resumable) or `sandbox.delete()` (permanent)  |

The Agent Worker (our standalone Node.js process, per AGENTS.md) would call this SDK the same way it currently calls `dockerode` locally — it does **not** need to run on Vercel's platform itself.

## 3. Authentication

Two supported methods ([vercel.com/docs/sandbox/concepts/authentication](https://vercel.com/docs/sandbox/concepts/authentication)):

| Method | When to use | How |
| :----- | :---------- | :-- |
| OIDC token (Vercel's recommended default) | Local dev, or code actually deployed on Vercel | Local: `npx vercel link` then `npx vercel env pull` — writes `VERCEL_OIDC_TOKEN` into `.env.local`. **Expires after 12 hours**; re-run `vercel env pull` if you see auth errors. On Vercel itself, token refresh is automatic. |
| Access token | External CI/CD, or any non-Vercel host — **this is our case**, since the Agent Worker is a standalone process on EC2/ECS, not Vercel (tech-stack.md §2.1, §4) | Set `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` and pass them straight into `Sandbox.create()`. |

```ts
import { Sandbox } from '@vercel/sandbox';

const sandbox = await Sandbox.create({
	teamId: process.env.VERCEL_TEAM_ID!,
	projectId: process.env.VERCEL_PROJECT_ID!,
	token: process.env.VERCEL_TOKEN!,
});
```

### How to get each value

**`VERCEL_TOKEN`** — create a [project-scoped access token](https://vercel.com/docs/accounts/access-tokens#project-scoped-access-token) (narrowest scope — recommended over a full-account token):

1. Make sure the scope selector at the top left of the dashboard shows your **personal account**, not a team.
2. Open the [Account Tokens page](https://vercel.com/account/tokens) (Settings → Tokens).
3. Enter a descriptive name (e.g. `workcrew-ai-sandbox`).
4. Open **Scope**, select the team that owns the project, then select the specific project (not "All Projects" — that creates a team-scoped token instead).
5. Choose an expiration and click **Create**.
6. Copy the token now — it starts with `vcp_` and is shown only once.

**`VERCEL_TEAM_ID`** — [docs](https://vercel.com/docs/accounts#find-your-team-id):

1. Open your team's dashboard → **Settings** in the sidebar → **General**.
2. Scroll to the **Team ID** section and copy it.
   (Shortcut: visit `https://vercel.com/teams/<your-team-name>/settings#team-id` directly.)

**`VERCEL_PROJECT_ID`** — [docs](https://vercel.com/docs/project-configuration/general-settings#project-id):

1. Select the right team from the team switcher, then open the project from the dashboard.
2. Open **Settings** in the sidebar → **General**.
3. Scroll to **Project ID** and copy it — it starts with `prj_`.

**Why OIDC alone doesn't work for us:** when `VERCEL_OIDC_TOKEN` isn't set, the SDK falls back to an interactive device-login flow — but that only triggers when `stdout`/`stdin` are both a real TTY. A request handled inside a running `next dev` process, or a deployed Agent Worker, isn't an interactive terminal session, so instead of prompting it throws `LocalOidcContextError` ("Could not get credentials from OIDC context..."). Setting the three access-token env vars above bypasses that path entirely.

`services/sandbox/adapters/vercel-sandbox.adapter.ts`'s `getVercelCredentials()` implements exactly this: it merges `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` into `Sandbox.create()`'s params when all three are set, and otherwise leaves them out so the SDK's default OIDC resolution still applies (useful if you've run `vercel link` + `vercel env pull` locally instead).

## 4. Core API walkthrough

### Create a sandbox and run a command

```ts
import { Sandbox } from '@vercel/sandbox';

const sandbox = await Sandbox.create({ timeout: 60_000 });
try {
	await sandbox.writeFiles([
		{ path: 'hello.js', content: Buffer.from("console.log('hi')\n") },
	]);
	const result = await sandbox.runCommand('node', ['hello.js']);
	if (result.exitCode !== 0) throw new Error(await result.stderr());
	console.log(await result.stdout());
} finally {
	await sandbox.stop();
}
```

### Clone a private repo — MVP1: `oauth-user` token (tech-stack.md §6)

GitHub accepts `x-access-token` as the username and a token as the password. For MVP1, the token comes from the `oauth-user` strategy — the user who connects the project clicks "Connect GitHub" and authorizes once; no PAT to paste, no `installationId` to look up.

**Setup (one-time, on the GitHub App itself):** enable "Request user authorization (OAuth) during installation" in the App's settings. This exposes a `clientId` and `clientSecret` on the same settings page as `appId`/`privateKey`.

**Flow:**

1. Redirect the user to `https://github.com/login/oauth/authorize?client_id=...&state=...`.
2. GitHub redirects back to your callback with a `code` (and the `state` you sent, to verify).
3. Exchange the code for a user token and use it directly as the Sandbox's Git credential:

```ts
import { createAppAuth } from '@octokit/auth-app';
import { Sandbox } from '@vercel/sandbox';

const auth = createAppAuth({
	appId: process.env.GITHUB_APP_ID!,
	privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
	clientId: process.env.GITHUB_APP_CLIENT_ID!,
	clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
});

const userAuth = await auth({ type: 'oauth-user', code, state });
// userAuth.token — oauth-user token, tied to this specific GitHub account
// userAuth.tokenType === 'oauth'

const sandbox = await Sandbox.create({
	source: {
		type: 'git',
		url: repoUrl,
		username: 'x-access-token',
		password: userAuth.token,
		depth: 1,
	},
});
```

4. If "expire user tokens" is enabled for the App, the result also includes `refreshToken`, `expiresAt`, and `refreshTokenExpiresAt` — store all of them, encrypted, so the connection can be refreshed instead of asking the user to reauthorize.

**Can one platform user connect more than one GitHub account?** Yes — this is purely a data-model choice on our side, not a GitHub limitation. Each time someone runs this OAuth flow, the resulting token is tied to whichever GitHub account they were logged into at that moment. To support several:

- Store connections in a table keyed by `(user_id, github_account_id)` — **not** a single `github_connection` column on `users` — where `github_account_id` is the numeric id GitHub returns for the authorized account (fetch it once via `GET /user` with the new token right after the exchange).
- Let the user trigger the same "Connect GitHub" flow again while signed into a different GitHub account (e.g. a different browser profile, or after logging out of github.com) — it produces a second token, stored as a second row.
- At commit/PR-attribution time, let the user pick which of their connected accounts to act as (or default to the most recently used one).

This is exactly how products like Vercel and Netlify let one person link multiple GitHub accounts — nothing about GitHub's OAuth flow prevents it; the only requirement is not constraining your own schema to one connection per user.

### Clone a private repo — Later (production): `installation` token, shared workspace identity

Once a workspace needs an org-wide bot identity instead of every action being attributed to one person (tech-stack.md §6, overview.md §7.1), swap to the `installation` strategy from the **same** `createAppAuth` call and the **same** registered GitHub App — no second app, no rewrite:

```ts
import { createAppAuth } from '@octokit/auth-app';
import { Sandbox } from '@vercel/sandbox';

const auth = createAppAuth({
	appId: process.env.GITHUB_APP_ID!,
	privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
});

const { token } = await auth({ type: 'installation', installationId });

const sandbox = await Sandbox.create({
	source: {
		type: 'git',
		url: repoUrl,
		username: 'x-access-token',
		password: token,
		depth: 1,
	},
});
```

Installation tokens expire after 1 hour and only cover repos in that installation — matches the "workspace App, project binds to a repo from it" model.

### Long-running / detached commands with streamed logs

Default timeout is 5 minutes; our stage rounds can run longer, so this matters:

```ts
const sandbox = await Sandbox.create({ timeout: 3 * 60 * 60 * 1000 }); // 3 hours
const command = await sandbox.runCommand({
	cmd: 'bash',
	args: ['-lc', 'npm test'],
	detached: true,
});
for await (const line of command.logs()) {
	process[line.stream === 'stdout' ? 'stdout' : 'stderr'].write(line.data);
}
const finished = await command.wait();
```

### Resume a persistent sandbox (maps to our stage-run reconciliation)

```ts
const sandbox = await Sandbox.get({ name: 'work-item-123' });
// or, if it might not exist yet:
const sandbox = await Sandbox.getOrCreate({ name: 'work-item-123' });
```

### Snapshot a prepared environment

Useful for caching `npm install` across rounds of the same ticket:

```ts
const snapshot = await sandbox.snapshot({ expiration: 24 * 60 * 60 * 1000 });
const restored = await Sandbox.create({ source: { type: 'snapshot', snapshotId: snapshot.snapshotId } });
```

### Stop vs. delete

- `sandbox.stop()` — ends the session, keeps the sandbox (and its snapshot) so it can resume later. Use this at the end of a stage round.
- `sandbox.delete()` — permanently removes it. Use this when a ticket closes or a workflow run finishes.

## 5. Is it free? (checked against Vercel's current pricing page, 2026-09-10)

**Short answer: free only on the Hobby plan, within monthly quotas — and Hobby is personal/non-commercial use only. For an actual production deployment of this platform, it is a metered paid service.**

| Metric                     | Hobby (included, free)     | Pro (per month, metered)      | Enterprise (per month)      |
| :-------------------------- | :--------------------------- | :------------------------------ | :----------------------------- |
| Active CPU                 | 5 hours/month               | $0.128/hour                     | $0.128/hour                    |
| Provisioned Memory         | 420 GB-hours/month          | $0.0212/GB-hour                 | $0.0212/GB-hour                |
| Sandbox Creations          | 5,000/month                 | $0.60 per 1M                    | $0.60 per 1M                   |
| Data Transfer (egress)     | 20 GB/month (ingress free)  | Included in Flat Rate CDN       | $0.15/GB                       |
| Snapshot Storage           | 15 GB (lifetime)            | $0.08/GB-month                  | $0.08/GB-month                 |
| Drive Storage              | 15 GB (lifetime)            | $0.05/GB-month                  | $0.05/GB-month                 |
| Drive Reads                | 30 GB/month                 | $0.0015/GB                      | $0.0015/GB                     |
| Drive Writes               | 30 GB/month                 | $0.004/GB                       | $0.004/GB                      |
| Concurrent Sandboxes       | 10                          | 10,000                          | 10,000                         |
| Max Session Duration       | 45 minutes                  | 24 hours                        | 24 hours                       |
| vCPU Allocation Rate       | 20/min, ramps to 40/min max | 150/min, ramps to 5,000/min max | 150/min, ramps to 5,000/min max |

Other relevant facts:

- On Hobby, exceeding any quota **pauses sandbox creation** (does not bill you) until 30 days after first use — upgrade to Pro to continue.
- On Pro, all Sandbox usage draws from the plan's **$20/month included credit** first, then bills at the rates above. [Spend Management](https://vercel.com/docs/spend-management) can cap or alert on this.
- Downloading data into a sandbox (npm installs, `git clone`) is free; sending data **out** (serving a port, pushing to an external API) is billable.
- Hobby's Terms scope it to personal, non-commercial projects — a real multi-tenant product like Workcrew AI would need Pro (or Enterprise) regardless of whether usage fits inside Hobby's numeric quotas.
- We don't use [Drives](https://vercel.com/docs/sandbox/concepts/drives) today — included for completeness, not because Workcrew AI currently needs persistent cross-sandbox storage.

### Monitoring usage

- **Dashboard:** [Sandboxes page](https://vercel.com/d?to=%2F%5Bteam%5D%2F%5Bproject%5D%2Fobservability%2Fsandboxes&title=Show+Sandbox+Page) under a project's Observability tab shows total/running/stopped sandboxes and command history. The account-wide [Usage dashboard](https://vercel.com/d?to=%2Fdashboard%2F%5Bteam%5D%2Fusage&title=Show+Usage+Page) tracks the metered dimensions above (Active CPU, Data Transfer, Provisioned Memory, Sandbox Creations, Snapshot Storage) against the current billing cycle.
- **CLI:** `sandbox list` (running only) or `sandbox list --all` (include stopped) lists sandboxes from the terminal.
- **Alerts before hitting a cap:** Vercel sends [on-demand usage notifications](https://vercel.com/docs/notifications#on-demand-usage-notifications) as a Hobby quota is approached; on Pro, set up [Spend Management](https://vercel.com/docs/spend-management) to alert or auto-pause once the $20 credit is exhausted and spend crosses a threshold you set.

## 6. Fit for Workcrew AI — summary

**Fits well:**
- Maps cleanly onto our existing `RunnerAdapter` interface — no interface redesign needed.
- Git-source + GitHub App installation token support covers repo checkout for free, replacing a chunk of custom clone/mount logic the "remote isolated runner" Open Decision currently leaves unsolved.
- Agent Worker stays a standalone process (per AGENTS.md) — it calls this as an external API, same shape as it calls `dockerode` locally. No change to the "separate process" rule or to local dev (local keeps using free Docker, unaffected).

**Tradeoffs to weigh before choosing it as the `production` Runner Adapter:**
- It is a paid, metered, Vercel-account-bound service (see §5) — picking it narrows the currently-open "container service, Kubernetes jobs, or managed sandbox provider" decision to one vendor.
- Max session duration (24h on Pro) and concurrency (10,000 on Pro) are generous, but still a hosted-platform limit, not something we control like a self-run Kubernetes job would be.
- Does not change anything about `local` — the zero-paid-services rule for local dev is unaffected either way.

This remains an **open decision** (overview.md §11); this document exists so the option is understood, not to lock it in.
