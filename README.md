# lab-console

[![Version](https://img.shields.io/badge/version-0.3.0-blue)](#-installation)
[![Type](https://img.shields.io/badge/type-web%20app-blueviolet)](#-installation)

A browser-based console for a shared bioinformatics workstation: a real `fish` shell (via `node-pty` + `xterm.js`) in tabs, a file browser for the user's home directory (upload with progress, download, ZIP, copy/move/rename/delete), a Monaco code editor, and a live CPU/RAM/GPU status bar — served by one Node.js process behind HTTP Basic Auth.

**Repository**: https://github.com/cheahhl814/lab-console

> [!NOTE]
> Current version: **v0.3.0** (updated 2026-10-19).

## Contents

- [Installation](#-installation)
- [Usage](#-usage)
- [Repository layout](#-repository-layout)
- [Hard guarantees](#-hard-guarantees)
- [Provenance](#provenance)

## 🚀 Installation

**Option A — give your AI agent this prompt:**

```text
Install lab-console from https://github.com/cheahhl814/lab-console —
clone it, make sure Node.js, the fish shell, and a C++ build toolchain
(g++, make, python3) are installed, then run `npm install` and `npm test`.
Copy .env.example to .env and ask me for the AUTH_USER / AUTH_PASS values.
Confirm when the tests pass.
```

**Option B — manual install:**

```bash
git clone https://github.com/cheahhl814/lab-console.git
cd lab-console
npm install
npm test
```

`node-pty` compiles a native module during `npm install`, so the machine needs a C++ toolchain plus `make` and `python3`. The `fish` shell must also be installed — it is the shell each terminal tab spawns.

| Platform | Command |
|:---------|:--------|
| Debian / Ubuntu | `sudo apt-get install -y build-essential python3 fish` |
| CentOS / RHEL | `sudo yum groupinstall -y 'Development Tools' && sudo yum install -y python3 fish` |
| Arch Linux | `sudo pacman -S --needed base-devel python fish` |
| No root (HPC) | `micromamba create -n node-env -c conda-forge nodejs fish compilers make python` |

> [!TIP]
> If `node-pty` fails to load after a Node.js upgrade, run `npm rebuild`.

## 💡 Usage

### Start the server

Credentials are required — the server refuses to start without them.

```bash
cp .env.example .env        # then set AUTH_USER and AUTH_PASS in .env
set -a; . ./.env; set +a
npm start
```

Open `http://localhost:3000` and log in. From another device on the same network, use `http://<server-ip>:3000` (find the IP with `ip addr show | grep "inet "`; if a firewall blocks it, `sudo ufw allow 3000/tcp`).

### What you can do

- **Terminal** — open it as a side panel or in its own browser tab (terminal menu → *New Browser Tab*); `+` adds shell tabs. The terminal-only tab adds a font-size stepper, a "shell is idle" notification toggle, and a copy-session button.
- **File browser** — list / grid / details views, a hidden-file toggle, and a right-click menu for new file/folder, upload, download (folders as ZIP), copy, cut, paste, duplicate, rename, and delete. Uploads show a progress popup with a cancel button.
- **Editor** — *Open with Monaco* (or click a text file) to edit in the browser.
- **Themes** — Default, Dracula, Solarized Light, and Github, applied to the whole app and every terminal.

### Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Purpose |
|:---------|:--------|:--------|
| `AUTH_USER` / `AUTH_PASS` | — (required) | Basic-auth credentials |
| `PORT` | `3000` | Listen port |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | unset | If both are set, serve HTTPS instead of HTTP |
| `LOG_LEVEL` | `info` | Structured (pino) log level |
| `UPLOAD_MAX_FILE_SIZE_MB` | no limit | Per-file upload cap |
| `UPLOAD_MAX_FILES` | `20` | Files per upload request |

On first run the server appends `set -g -x fish_greeting ""` to the user's `config.fish` to suppress fish's greeting.

### Keep it running

| Method | Start | Notes |
|:-------|:------|:------|
| `pm2` | `AUTH_USER=<user> AUTH_PASS=<password> pm2 start server.js` | pm2 saves the env at start; after changing it, run `pm2 restart server --update-env` |
| `nohup` | `AUTH_USER=<user> AUTH_PASS=<password> nohup node server.js &` | Output goes to `nohup.out`; stop with `kill <PID>` |
| systemd | see `deploy/systemd/web-terminal.service` | Reads `.env` via `EnvironmentFile`; logs go to the journal |

## 📁 Repository layout

```text
lab-console/
├── server.js                # Express app: auth, file API, uploads, WebSocket PTY, status stats
├── logger.js                # pino structured logger
├── public/
│   ├── index.html           # App shell (toolbar, file browser, terminal panel, status bar)
│   ├── main.js              # Terminal tabs, file browser, uploads, themes
│   ├── style.css            # Theme tokens + layout
│   ├── editor.html          # Monaco editor page
│   ├── editor.js            # Editor load/save logic
│   ├── icons.svg            # Toolbar icon sprite
│   └── vendor/htmx.min.js   # htmx (vendored)
├── test/server.test.js      # Jest + supertest API tests (sandboxed home dir)
├── deploy/systemd/          # systemd unit template
├── .env.example             # Configuration reference
└── ROADMAP.md               # Planned features
```

## 🔒 Hard guarantees

- **No anonymous access** — every route, including the terminal WebSocket and static files, is behind Basic Auth, and the server will not start without `AUTH_USER` / `AUTH_PASS`.
- **File operations stay in the home directory** — file-API paths are resolved and checked against the running user's home; `../` escapes and prefix-sibling tricks return `403`.
- **No internals leaked** — a global error handler logs the real error server-side and returns a generic message, never a stack trace or file path.
- **Hardened headers** — `helmet` is enabled (its CSP is off, because htmx and Monaco need it off).

> [!WARNING]
> Each terminal is a **full shell as the server's user** — anyone who logs in can do anything that user can. There is **no rate limiting** on login attempts, and the default transport is **plain HTTP**. Keep it on a trusted network, use a strong password, and put a reverse proxy with TLS and rate limiting (or `fail2ban`) in front of it before exposing it more widely. Do not expose it directly to the public internet.

> [!IMPORTANT]
> Known limitation: with `TLS_CERT_PATH` / `TLS_KEY_PATH` set, pages are served over HTTPS but the terminal WebSocket is not yet attached to the HTTPS server, so terminal tabs do not connect. Terminate TLS at a reverse proxy instead for now.

## Provenance

Built on [xterm.js](https://github.com/xtermjs/xterm.js) (terminal rendering), [node-pty](https://github.com/microsoft/node-pty) (pseudoterminals), [Express](https://expressjs.com/) with `express-ws`, [htmx](https://htmx.org/) (file-browser updates), and [Monaco Editor](https://github.com/microsoft/monaco-editor) (loaded from cdnjs).

## License

Declared as ISC in `package.json`; no license file is included yet.
