# Quickstart

This guide takes you from zero to a paid job application in five minutes. You need Node.js ≥22 and a terminal.

## Install and Verify

Install the CLI globally and run diagnostics:

```bash
npm i -g @dirgha/code
dirgha doctor
```

Expected output:

```
[dirgha] Node version: 22.4.1 ✓
[dirgha] Config directory: /home/user/.dirgha ✓
[dirgha] Git available: 2.43.0 ✓
[dirgha] Default provider: kimi ✓
[dirgha] All checks passed.
```

## Authenticate

Log in via device flow:

```bash
dirgha login
```

The CLI prints a device code and URL:

```
Device code: ABCD-EFGH
Open https://dirgha.ai/device in your browser
Waiting...
```

Open the URL, enter the code, and authorize. The CLI polls every 5 seconds. Upon success:

```
✓ Authenticated as @username
[dirgha] Token stored in ~/.dirgha/auth.json
```

## Your First Coding Session

Create a demo directory and a simple file:

```bash
mkdir demo && cd demo
echo "function add(a,b){return a+b}" > math.js
```

Ask Dirgha to extend the file:

```bash
dirgha code "add a multiply function to this file"
```

The session loads, reads `math.js`, and plans the change:

```
[dirgha] Session started: sess_8f2a9b
[dirgha] Reading math.js...
[dirgha] Planning changes...
[dirgha] Generated diff:
  + function multiply(a, b) {
  +   return a * b;
  + }
Apply? [y/N]: y
```

After approval:

```
[dirgha] Applied to math.js
[dirgha] Snapshot: 7d3e9f2 (math.js)
[dirgha] Session saved (1/50)
[dirgha] Run `dirgha resume sess_8f2a9b` to continue.
```

Verify the file:

```bash
cat math.js
```

Output:

```javascript
function add(a,b){return a+b}
function multiply(a, b) {
  return a * b;
}
```

## Browse Jobs

List available jobs filtered by tag and minimum budget:

```bash
dirgha jobs list --tag javascript --min 200
```

Output:

```
ID          TITLE                           BUDGET   CURRENCY   TAGS
job_9x2b    Refactor legacy callback API    500      USD        [javascript, node]
job_3a7k    Add TypeScript types to SDK     800      USD        [javascript, typescript]
```

Export as JSON for scripting:

```bash
dirgha jobs list --tag javascript --min 200 --json | jq '.[0].id'
```

## Apply to a Job

In v1.0, job applications open in your default browser:

```bash
dirgha jobs open job_9x2b
```

This launches `https://dirgha.ai/jobs/job_9x2b/apply` with your session token pre-filled. Native CLI application (`dirgha jobs apply`) arrives in v1.5.

## Check Your Footprint

Review local storage usage:

```bash
dirgha doctor
```

Sample output:

```
[dirgha] Session count: 1 (50 max)
[dirgha] Snapshot buffer: 12KB / 200MB
[dirgha] Memory (GEPA): 4.2MB
[dirgha] Provider quota: 847/1000 requests remaining
```

Preview cleanup without deleting:

```bash
dirgha prune --dry-run
```

To actually remove old snapshots and closed sessions:

```bash
dirgha prune --snapshots --sessions --confirm
```

You are now ready to code, snapshot, and earn. See [JOBS_MARKETPLACE.md](./JOBS_MARKETPLACE.md) for the economic model and [ARCHITECTURE.md](./ARCHITECTURE.md) for system internals.
