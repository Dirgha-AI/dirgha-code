# Installing Dirgha on Windows

This guide covers installing `@dirgha/code` on Windows — including the optional SQLite-backed features (chat history, session search) that require a one-time native build step on some systems.

## Quick install

Open PowerShell or Windows Terminal and run:

```powershell
npm install -g @dirgha/code
dirgha
```

That's it for the core CLI. It works immediately — agent loop, all 17 providers, parallel fleet, skills, memory, and MCP support are all available without any extra step.

Optional features (persistent chat history and session search) require SQLite. For most users, a prebuilt binary is downloaded automatically. See the next section to enable them.

## Optional features setup

Run once after install:

```powershell
dirgha setup --features
```

This command tries to download a prebuilt `better-sqlite3` binary that matches your exact Node.js version and Windows architecture. For most users it completes silently in a few seconds and you're done.

If no prebuilt is available for your Node version, the command will tell you and offer a fallback path — compiling SQLite locally using the Microsoft C++ build tools. Follow the guided prompts, or see the section below to prepare those tools in advance.

## If `dirgha setup --features` asks you to install VS Build Tools

Some Node versions don't have a prebuilt SQLite binary. In that case, `better-sqlite3` needs to compile from source, which requires the Microsoft C++ toolchain.

**Step 1 — Download VS Build Tools:**

```
https://aka.ms/vs/17/release/vs_BuildTools.exe
```

Run the installer. You do not need a full Visual Studio IDE.

**Step 2 — Select the right workload:**

In the Visual Studio Installer, check:

- **Desktop development with C++** (the main workload)
- Inside that workload, also enable the optional component: **Windows 10 SDK** or **Windows 11 SDK** (whichever matches your OS)

The download is roughly 4-6 GB. The C++ compiler and Windows SDK are the only things Dirgha needs.

**Step 3 — Restart your terminal, then re-run:**

```powershell
dirgha setup --features
```

The compile step runs once. Every subsequent `npm install -g @dirgha/code` upgrade reuses the same toolchain without prompting again. All other Node packages that use native modules (Electron, canvas, sharp, etc.) also benefit from this one-time setup.

## Node.js version

Dirgha requires Node.js 18 or later. We recommend **Node 22 LTS** or **Node 24** for the best experience.

Node 18 and 20 have reached end-of-life upstream and will stop receiving security patches. If you're on an older version, install a current release from [nodejs.org](https://nodejs.org).

You can check your current version with:

```powershell
node --version
```

## Verify your install

```powershell
dirgha --version
dirgha doctor
```

A healthy `dirgha doctor` output looks like this:

```
dirgha doctor
  ✓ core         CLI runtime OK (v1.18.x)
  ✓ sqlite        better-sqlite3 loaded — chat history and session search enabled
  ✓ node          Node.js v22.x — supported
  ✓ network       connectivity OK
  ✓ config        ~/.dirgha/config.json found
```

If `sqlite` shows a warning instead of a checkmark, run `dirgha setup --features` to resolve it.

## Common issues

**`npm error gyp ERR! build error` during install**

VS Build Tools are not installed. Run `dirgha setup --features` — it will walk you through the fix. Or jump directly to the VS Build Tools download above.

**`EPERM: operation not permitted` when updating**

Windows locks npm's global prefix directory when another terminal has a Node process running. Close any open terminal windows (including VS Code's integrated terminal), open a new PowerShell session as administrator, and re-run the install.

**`getaddrinfo ENOTFOUND` or connection errors**

Check your internet connection. If you're behind a corporate proxy, set the `HTTPS_PROXY` environment variable:

```powershell
$env:HTTPS_PROXY = "http://proxy.corp.example.com:8080"
npm install -g @dirgha/code
```

To make it permanent, add it to your PowerShell profile or Windows system environment variables.

**`dirgha` not found after install**

npm's global binary directory is not on your PATH. Find it:

```powershell
npm config get prefix
```

Take the output (e.g., `C:\Users\you\AppData\Roaming\npm`) and add it to your `PATH` in System Properties → Advanced → Environment Variables. Restart your terminal after saving.

## Windows-specific tips

- **Windows Terminal** is recommended over the legacy `cmd.exe` for correct Unicode rendering, color support, and a better resize experience. Download it from the Microsoft Store.
- **PowerShell 7+** is recommended over the built-in Windows PowerShell 5.1. Install it from [aka.ms/PSWindows](https://aka.ms/PSWindows).
- **WSL2 also works.** If you prefer a Linux environment, install Ubuntu from the Microsoft Store, then install Dirgha inside WSL using the standard Linux instructions (`npm install -g @dirgha/code`). WSL2 has no native-build friction — the prebuilt SQLite binary works directly.
