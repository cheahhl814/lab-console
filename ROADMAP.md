# Web Terminal Roadmap: Future Implementations

This document outlines the planned UI improvements and feature enhancements for the Web Terminal tool (v0.3.0). The goal is to evolve the current tool from a basic terminal emulator into a comprehensive web-based IDE experience.

## 🎨 UI Improvements

### 1. Layout & Aesthetics

- [ ] **Unified Theme System**: Implement a global theme engine (e.g., Nord, One Dark, GitHub Light) that synchronizes the styles of the file browser, tabs, and status bar.
- [ ] **Professional Iconography**: Replace Unicode symbols with a modern icon set such as Lucide or FontAwesome for better visual hierarchy.
- [ ] **Breadcrumb Navigation**: Replace the text header in the file browser with clickable breadcrumbs for faster directory traversal.
- [ ] **Enhanced Tab UI**: Add an active-state visual indicator (e.g., top border highlight) and smooth hover transitions.

### 2. File Browser UX

- [ ] **Search & Filter**: Add a real-time filter bar to quickly locate files within large directories.
- [ ] **Advanced Selection**: Support multi-file selection (Shift+Click/Ctrl+Click) for batch operations (delete, download, move).
- [ ] **Visual File Extensions**: implement color-coding for file names based on extensions (e.g., `.py` $\rightarrow$ green, `.js` $\rightarrow$ blue).
- [ ] **Hybrid File Exploration**: Implement a "Full-Screen Explorer" mode in a new tab with an icon-grid layout, distinct from the sidebar's list view.

### 3. Terminal & Status Experience

- [ ] **Data Visualization**: Replace raw text stats in the status bar with sparklines or mini progress bars for CPU/RAM usage.
- [ ] **Tab Management**: Allow users to rename terminal tabs (via double-click) to better organize concurrent tasks.
- [ ] **Toast Notification System**: Replace browser `alert()` calls with non-intrusive, timed toast notifications.

---

## 🚀 Recommended Features

### 1. Integrated Editor (Web-IDE Evolution)

- [ ] **Embedded Monaco/Ace Editor**: Integrate the editor directly into the main UI as a split-pane or a separate tab, removing the need for new browser windows.
- [ ] **Auto-Save & Sync**: Implement a seamless saving mechanism that interacts with the backend API without requiring page refreshes.

### 2. HPC-Specific Job Monitor

- [ ] **Visual Queue Manager**: Create a dedicated panel that parses `squeue` output into a professional table.
- [ ] **Job Controls**: Add a "Kill Job" button directly in the UI.
- [ ] **Real-time Updates**: Implement polling or WebSocket updates for job status changes.

### 3. Advanced File Integration

- [ ] **Drag-and-Drop Upload**: Enable dragging files from the local OS directly into the file browser.
- [ ] **Terminal-Browser Sync**: Automatically update the file browser's current directory when a `cd` command is executed in the terminal.

### 4. Session & Productivity

- [ ] **Session Persistence**: Use `localStorage` to save the user's theme, open tabs, and last active directory.
- [ ] **Command Palette**: Implement a `Ctrl+K` shortcut to quickly access common actions (New Tab, Search, etc.).

### 5. Security & Stability

- [ ] **Idle Timeout**: Automatically terminate inactive PTY sessions to conserve server resources.
- [ ] **JWT Authentication**: Migrate from Basic Auth to JSON Web Tokens (JWT) for more secure and scalable session management.

---

## 🛡️ Security Hardening (Priority)

### 🔴 Critical
- [ ] **Eliminate XSS Vulnerabilities**: Change all usages of `.innerHTML` to `.textContent` when rendering filenames/paths in `main.js`.
- [ ] **Secure Credential Management**: Move hardcoded credentials to environment variables (`.env`) and enforce HTTPS for all traffic.

### 🟠 High
- [ ] **Implement Resource Quotas**: Add maximum upload size limits in `multer` and cap the number of concurrent PTY sessions per user.
- [ ] **CSRF Protection**: Implement CSRF tokens or set `SameSite: Strict` cookies to prevent cross-site request forgery.
- [ ] **WebSocket Authentication**: Verify and enforce auth check on the WebSocket upgrade request to prevent unauthorized access to the shell.

### 🟡 Medium
- [ ] **Robust Path Validation**: Implement a stricter path verification system to prevent symlink-based traversal outside the home directory.
- [ ] **Privilege Dropping**: Configure the Node.js process to run as a dedicated low-privilege user.
