document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let tabs = [];
    let activeTabId = null;
    let clipboard = null; // For copy/paste

    const themes = {
        'Default': { background: '#252526', foreground: '#d4d4d4', cursor: '#d4d4d4' },
        'Dracula': { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selection: '#44475a', black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2', brightBlack: '#555555', brightRed: '#ff5555', brightGreen: '#50fa7b', brightYellow: '#f1fa8c', brightBlue: '#bd93f9', brightMagenta: '#ff79c6', brightCyan: '#8be9fd', brightWhite: '#ffffff' },
        'Solarized Light': { background: '#fdf6e3', foreground: '#657b83', cursor: '#657b83', selection: '#eee8d5', black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5', brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3' },
        'Github': { background: '#ffffff', foreground: '#3e3e3e', cursor: '#3e3e3e', selection: '#b4d5fe', black: '#3e3e3e', red: '#970b16', green: '#07962a', yellow: '#f8eec7', blue: '#003e8a', magenta: '#e94691', cyan: '#89d1ec', white: '#ffffff', brightBlack: '#666666', brightRed: '#de0000', brightGreen: '#87d5a2', brightYellow: '#fbf851', brightBlue: '#427ab3', brightMagenta: '#f5a9d1', brightCyan: '#b3f0ff', brightWhite: '#ffffff' }
    };
    let activeTheme = 'Default';
    let userHomeDir = '';
    let uploadDestination = '';

    // --- DOM ELEMENTS ---
    const fileList = document.getElementById('file-list');
    const uploadBtn = document.getElementById('upload-btn');
    const newFolderBtn = document.getElementById('new-folder-btn');
    const fileInput = document.getElementById('file-input');
    const contextMenu = document.getElementById('context-menu');
    const contextMenuItemDownload = document.getElementById('context-menu-item-download');
    const tabBar = document.getElementById('tab-bar');
    const newTabBtn = document.getElementById('new-tab-btn');
    const terminalViews = document.getElementById('terminal-views');
    // ponytail: theme-select <select> replaced by a button + dropdown menu (Phase 0.1 polish).
    const themeMenuBtn = document.getElementById('theme-menu-btn');
    const themeMenu = document.getElementById('theme-menu');
    // Show hidden button (replaces the legacy checkbox).
    const showHiddenBtn = document.getElementById('show-hidden-btn');
    // Terminal open modes — side panel and new tab (merged into one dropdown).
    const terminalMenuBtn = document.getElementById('terminal-menu-btn');
    const terminalMenu = document.getElementById('terminal-menu');
    // Home button — jumps to home dir.
    const homeBtn = document.getElementById('home-btn');
    // Up button — navigates to parent of current path. Disabled at root (home dir).
    const upBtn = document.getElementById('up-btn');

    // --- FUNCTION DEFINITIONS ---

    function populateThemes() {
        // Build the dropdown menu items. themeMenuBtn click toggles visibility.
        if (!themeMenu) return;
        themeMenu.innerHTML = '';
        for (const themeName in themes) {
            const item = document.createElement('div');
            item.className = 'theme-menu-item';
            item.dataset.theme = themeName;
            item.textContent = themeName;
            if (themeName === activeTheme) item.classList.add('active');
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                setActiveTheme(themeName);
                themeMenu.classList.add('hidden');
                themeMenuBtn.setAttribute('aria-expanded', 'false');
            });
            themeMenu.appendChild(item);
        }
        // Toggle menu on button click.
        themeMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = themeMenu.classList.toggle('hidden');
            themeMenuBtn.setAttribute('aria-expanded', String(!isHidden));
        });
        // Click-outside closes the menu.
        document.addEventListener('click', () => {
            themeMenu.classList.add('hidden');
            themeMenuBtn.setAttribute('aria-expanded', 'false');
        });
        document.documentElement.dataset.theme = activeTheme;
    }

    function setActiveTheme(themeName) {
        activeTheme = themeName;
        document.documentElement.dataset.theme = activeTheme;
        const theme = themes[activeTheme];
        tabs.forEach(tab => tab.term.options.theme = theme);
        // Refresh .active marker on menu items.
        if (themeMenu) {
            themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
                item.classList.toggle('active', item.dataset.theme === themeName);
            });
        }
    }

    async function fetchHomeDir() {
        try {
            const response = await fetch('/api/home');
            if (!response.ok) return;
            userHomeDir = await response.text();
        } catch (error) {
            console.error('Error fetching home directory:', error);
        }
    }

    // --- TAB FUNCTIONS ---
    function createTab() {
        const tabId = Date.now();
        activeTabId = tabId;

        // Create UI elements
        const tabEl = document.createElement('div');
        tabEl.className = 'tab';
        tabEl.dataset.tabId = tabId;
        tabEl.innerHTML = `<span>Terminal</span> <button class="close-tab-btn">x</button>`;
        tabBar.insertBefore(tabEl, newTabBtn);

        const termViewEl = document.createElement('div');
        termViewEl.className = 'terminal-view';
        termViewEl.dataset.tabId = tabId;
        terminalViews.appendChild(termViewEl);

        // Create xterm instance
        const term = new Terminal({ theme: themes[activeTheme] });
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);
        term.open(termViewEl);

        // Create WebSocket
        const ws = new WebSocket(`ws://${window.location.host}/ws`);

        const tab = { id: tabId, term, ws, fitAddon, tabEl, termViewEl };
        tabs.push(tab);

        // Setup WebSocket listeners
        ws.onopen = () => {
            // ponytail: defer first paint to the next animation frame. Without this, the
            // canvas draws into the #terminal-surface compositor layer during the same
            // initial layout pass that the slide-in transform is resolving, and the
            // browser never flushes that first draw until some later unrelated event
            // (e.g. opening a second tab) forces a full repaint. Diagnosed by claude-htmx 2026-08-30.
            requestAnimationFrame(() => {
                fitAddon.fit();
                term.write("  ▄▄▄  ▄▄▄  ▄▄    ▄▄  ▄▄▄  ▄▄▄     ▄▄▄▄   ▄▄▄▄▄▄\r\n");
                term.write("  ███  ███  ██    ██  ███  ███   ██▀▀▀▀█  ██▀▀▀▀█▄\r\n");
                term.write("  ████████  ██    ██  ████████  ██        ██    ██\r\n");
                term.write("  ██ ██ ██  ██    ██  ██ ██ ██  ██  ▄▄▄▄  ██████▀\r\n");
                term.write("  ██ ▀▀ ██  ██    ██  ██ ▀▀ ██  ██  ▀▀██  ██\r\n");
                term.write("  ██    ██  ▀██▄▄██▀  ██    ██   ██▄▄▄██  ██\r\n");
                term.write("  ▀▀    ▀▀    ▀▀▀▀    ▀▀    ▀▀     ▀▀▀▀   ▀▀\r\n");
                term.write(" #######################################################################################\r\n");
                term.write(" HP Workstation@MUMGP - Web Terminal v0.3\r\n");
                term.write(" #######################################################################################\r\n");
                term.write(" HP Workstation@MUMGP uses Fish (Friendly Interactive Shell) by default in place of\r\n");
                term.write(" Bash Shell. Fish is designed for a modern, user-friendly experience out-of-the-box\r\n");
                term.write(" with smart features like built-in autosuggestions and syntax highlighting.\r\n");
                term.write(" #######################################################################################\r\n");
                term.write(" Recommended bioinformatics tool installation method: Pixi\r\n");
                term.write(" Pixi is a modern, fast, and project-oriented package manager designed as a\r\n");
                term.write(" next-generation tool for the conda ecosystem. Pixi uses the resolvo Rust-based solver\r\n");
                term.write(" for conda packages and uv for PyPI packages, resulting in faster and more accurate\r\n");
                term.write(" resolution than traditional Conda.\r\n");
                term.write(" Example usage:\r\n");
                term.write("  - Install a tool globally: 'pixi global install -c conda-forge -c bioconda <tool_name>'\r\n");
                term.write("  - Check globally installed tools: 'pixi global list'\r\n");
                term.write("  - Uninstall a globally installed tool: 'pixi global uninstall <tool_name>'\r\n");
                term.write("  - Project(directory)-specific tool installation: 'pixi init && pixi add <tool_name>'\r\n");
                term.write(" #######################################################################################\r\n");
            });
        };
        ws.onmessage = (event) => {
            term.write(event.data);
        };
        ws.onclose = () => term.write('\r\nConnection closed. This tab is now inactive.\r\n');
        // Setup xterm listener
        term.onData((data) => ws.send(data));

        let resizeTimeout;
        term.onResize(({ cols, rows }) => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                ws.send(JSON.stringify({ cols, rows }));
            }, 100);
        });

        tabEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('close-tab-btn')) {
                closeTab(tabId);
            } else {
                switchToTab(tabId);
            }
        });

        switchToTab(tabId);
        term.focus();
    }

    function switchToTab(tabId) {
        activeTabId = tabId;
        tabs.forEach(tab => {
            const isActive = tab.id === tabId;
            tab.tabEl.classList.toggle('active', isActive);
            tab.termViewEl.style.display = isActive ? 'block' : 'none';
            if (isActive) {
                tab.fitAddon.fit();
                tab.term.focus();
            }
        });
    }

    function closeTab(tabId) {
        const tabIndex = tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const tabToClose = tabs[tabIndex];
        tabToClose.ws.close();
        tabToClose.term.dispose();
        tabToClose.tabEl.remove();
        tabToClose.termViewEl.remove();

        tabs.splice(tabIndex, 1);

        if (activeTabId === tabId) {
            if (tabs.length > 0) {
                const newActiveIndex = Math.max(0, tabIndex - 1);
                switchToTab(tabs[newActiveIndex].id);
            } else {
                activeTabId = null;
            }
        }
    }

    // --- FILE BROWSER LOGIC ---

    // --- UPLOAD LOGIC ---
    function handleFileSystemAction(endpoint, body) {
        // htmx.ajax's promise only rejects on request-construction/network failures, not on
        // HTTP error statuses (those instead fire htmx:responseError), so both must be handled
        // here to surface server-side failures (e.g. 403/500) to the user.
        const onResponseError = (event) => {
            if (event.detail.pathInfo && event.detail.pathInfo.requestPath === endpoint) {
                alert('Action failed: ' + (event.detail.xhr.responseText || event.detail.error));
                document.body.removeEventListener('htmx:responseError', onResponseError);
            }
        };
        document.body.addEventListener('htmx:responseError', onResponseError);
        htmx.ajax('POST', endpoint, {
            values: body,
            swap: 'none' // response has no target; HX-Trigger from the server refreshes #file-list
        }).then(() => {
            document.body.removeEventListener('htmx:responseError', onResponseError);
        }).catch(error => {
            alert('Action failed: ' + error);
            console.error(`Error with ${endpoint}:`, error);
            document.body.removeEventListener('htmx:responseError', onResponseError);
        });
    }


    // --- EVENT LISTENERS ---

    // THEME LISTENER
    // ponytail: theme is now set via menu item click in populateThemes() (setActiveTheme).

    // SHOW HIDDEN toggle — button replaces the legacy checkbox.
    // The legacy /files route reads req.query.showHidden === 'true'. We synthesize a hidden
    // input #show-hidden-checkbox so htmx's hx-include picks it up, and flip its value before
    // each htmx trigger.
    let showHidden = false;
    (function ensureShowHiddenCheckbox() {
        let cb = document.getElementById('show-hidden-checkbox');
        if (cb) return;
        cb = document.createElement('input');
        cb.type = 'hidden';
        cb.id = 'show-hidden-checkbox';
        cb.name = 'showHidden';
        cb.value = 'false';
        document.body.appendChild(cb);
    })();
    function syncShowHiddenCheckbox() {
        const cb = document.getElementById('show-hidden-checkbox');
        if (cb) cb.value = showHidden ? 'true' : 'false';
    }
    if (showHiddenBtn) {
        showHiddenBtn.addEventListener('click', () => {
            showHidden = !showHidden;
            showHiddenBtn.setAttribute('aria-pressed', String(showHidden));
            syncShowHiddenCheckbox();
            htmx.trigger('#file-list', 'file-list-changed');
        });
    }

    // NEW FOLDER EVENT LISTENER
    newFolderBtn.addEventListener('click', () => {
        const folderName = prompt('Enter new folder name:');
        if (folderName) {
            handleFileSystemAction('/create-folder', { path: `${document.getElementById('current-path').value}/${folderName}` });
        }
    });


    // UPLOAD EVENT LISTENERS
    uploadBtn.addEventListener('click', () => {
        uploadDestination = document.getElementById('current-path').value;
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const files = fileInput.files;
        if (files.length === 0) return;

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('destination', uploadDestination);

            try {
                const response = await fetch('/upload', { method: 'POST', body: formData });
                if (!response.ok) {
                    throw new Error(await response.text() || `Upload failed for ${file.name}`);
                }
            } catch (error) {
                alert(error.message);
                console.error(`Error uploading file ${file.name}:`, error);
            }
        }
        fileInput.value = '';
    });

    // CONTEXT MENU EVENT LISTENERS
    const contextMenuItems = {
        copy: document.getElementById('context-menu-item-copy'),
        cut: document.getElementById('context-menu-item-cut'),
        paste: document.getElementById('context-menu-item-paste'),
        duplicate: document.getElementById('context-menu-item-duplicate'),
        download: document.getElementById('context-menu-item-download'),
        rename: document.getElementById('context-menu-item-rename'),
        delete: document.getElementById('context-menu-item-delete'),
        newFile: document.getElementById('context-menu-item-new-file'),
        newFolder: document.getElementById('context-menu-item-new-folder'),
        upload: document.getElementById('context-menu-item-upload'),
        openWithMonaco: document.getElementById('context-menu-item-open-with-monaco')
    };

    fileList.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu.classList.add('hidden'); // Hide first

        const targetLi = e.target.closest('li, tr[data-path]');

        // Show/hide menu items based on context
        if (targetLi) {
            // Clicked on a file or folder. (2026-08-30: removed the `.. (Up)` exclusion —
            // that row no longer exists; parent navigation is the toolbar #up-btn.)
            Object.values(contextMenuItems).forEach(item => item.style.display = 'none');
            const path = targetLi.dataset.path;
            const type = targetLi.dataset.type;
            const name = path.split('/').pop();

            [contextMenuItems.copy, contextMenuItems.cut, contextMenuItems.duplicate, contextMenuItems.download, contextMenuItems.rename, contextMenuItems.delete].forEach(item => item.style.display = 'block');

            if (type === 'file') {
                contextMenuItems.openWithMonaco.style.display = 'block';
            } else {
                contextMenuItems.openWithMonaco.style.display = 'none';
                contextMenuItems.upload.style.display = 'block';
            }

            // Open with Monaco action
            contextMenuItems.openWithMonaco.onclick = () => {
                window.open(`editor.html?path=${encodeURIComponent(path)}`, '_blank');
            };

            // Copy action
            contextMenuItems.copy.onclick = () => {
                clipboard = { path: path, type: type, operation: 'copy' };
            };

            // Cut action
            contextMenuItems.cut.onclick = () => {
                clipboard = { path: path, type: type, operation: 'cut' };
            };

            // Duplicate action
            contextMenuItems.duplicate.onclick = () => {
                handleFileSystemAction('/duplicate-item', { sourcePath: path });
            };

            // Download action
            contextMenuItems.download.textContent = type === 'directory' ? 'Download as ZIP' : 'Download';
            contextMenuItems.download.onclick = () => {
                const url = type === 'directory' ? `/download-zip?path=${encodeURIComponent(path)}` : `/download?path=${encodeURIComponent(path)}`;
                window.location.href = url;
            };

            // Rename action
            contextMenuItems.rename.onclick = () => {
                const newName = prompt('Enter new name:', name);
                if (newName && newName !== name) {
                    const newPath = path.substring(0, path.lastIndexOf('/') + 1) + newName;
                    handleFileSystemAction('/rename-item', { oldPath: path, newPath: newPath });
                }
            };

            // Delete action
            contextMenuItems.delete.onclick = () => {
                if (confirm(`Are you sure you want to delete '${name}'?`)) {
                    handleFileSystemAction('/delete-item', { path: path });
                }
            };
            
            contextMenuItems.upload.onclick = () => {
                uploadDestination = path;
                fileInput.click();
            };

        } else {
            // Clicked on background
            Object.values(contextMenuItems).forEach(item => item.style.display = 'none');
            [contextMenuItems.newFile, contextMenuItems.newFolder, contextMenuItems.paste, contextMenuItems.upload].forEach(item => item.style.display = 'block');
            contextMenuItems.paste.style.display = clipboard ? 'block' : 'none';


            // New File action
            contextMenuItems.newFile.onclick = () => {
                const fileName = prompt('Enter new file name:');
                if (fileName) {
                    handleFileSystemAction('/create-file', { path: `${document.getElementById('current-path').value}/${fileName}` });
                }
            };

            // New Folder action
            contextMenuItems.newFolder.onclick = () => {
                const folderName = prompt('Enter new folder name:');
                if (folderName) {
                    handleFileSystemAction('/create-folder', { path: `${document.getElementById('current-path').value}/${folderName}` });
                }
            };

            // Upload action
            contextMenuItems.upload.onclick = () => {
                uploadDestination = document.getElementById('current-path').value;
                fileInput.click();
            };

            // Paste action
            contextMenuItems.paste.onclick = () => {
                if (clipboard) {
                    if (clipboard.operation === 'cut') {
                        handleFileSystemAction('/move-item', { sourcePath: clipboard.path, destinationPath: document.getElementById('current-path').value });
                    } else {
                        handleFileSystemAction('/paste-item', { sourcePath: clipboard.path, destinationPath: document.getElementById('current-path').value });
                    }
                    clipboard = null;
                }
            };
        }

        contextMenu.style.top = `-9999px`;
        contextMenu.style.left = `-9999px`;
        contextMenu.classList.remove('hidden');

        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let top = e.clientY;
        let left = e.clientX;

        if (top + menuHeight > windowHeight) {
            top = e.clientY - menuHeight;
        }
        if (top < 0) {
            top = 0;
        }

        if (left + menuWidth > windowWidth) {
            left = windowWidth - menuWidth;
        }
        if (left < 0) {
            left = 0;
        }

        contextMenu.style.top = `${top}px`;
        contextMenu.style.left = `${left}px`;
    });

    // --- GLOBAL LISTENERS ---
    window.addEventListener('click', () => contextMenu.classList.add('hidden'));
    window.addEventListener('resize', () => {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) activeTab.fitAddon.fit();
    });
    newTabBtn.addEventListener('click', createTab);

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'c') {
            const selectedItem = fileList.querySelector('.selected');
            if (selectedItem) {
                clipboard = { path: selectedItem.dataset.path, type: selectedItem.dataset.type };
            }
        } else if (e.ctrlKey && e.key === 'v') {
            if (clipboard) {
                handleFileSystemAction('/paste-item', { sourcePath: clipboard.path, destinationPath: document.getElementById('current-path').value });
            }
        }
    });

    fileList.addEventListener('click', (e) => {
        const targetLi = e.target.closest('li, tr[data-path]');
        if (targetLi) {
            fileList.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            targetLi.classList.add('selected');

            const action = targetLi.dataset.action;
            if (action === 'view') {
                window.open(`/view-file?path=${encodeURIComponent(targetLi.dataset.path)}`, '_blank');
            } else if (action === 'edit') {
                window.open(`editor.html?path=${encodeURIComponent(targetLi.dataset.path)}`, '_blank');
            }
        }
    });

    // --- OVERLAY LAYOUT (Phase 0.1) ---
    // ponytail: terminal is a slide-in panel toggled by the toolbar button.
    // View-mode buttons are stubs for Phase 0.2 (visual-only for now).
    function toggleTerminal() {
        const surface = document.getElementById('terminal-surface');
        if (!surface) return;
        surface.classList.toggle('open');
        const isOpen = surface.classList.contains('open');
        // Refit active xterm when panel opens — xterm needs visible dimensions to render correctly.
        if (isOpen) {
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab && activeTab.fitAddon) {
                requestAnimationFrame(() => activeTab.fitAddon.fit());
            }
        }
    }

    function initOverlayLayout() {
        // ponytail: ?terminal=open query forces the terminal-only mode (no file browser,
        // terminal panel open full-viewport). Used by the 'New Browser Tab' terminal action.
        const params = new URLSearchParams(window.location.search);
        if (params.get('terminal') === 'open') {
            const fileSurface = document.getElementById('file-browser-surface');
            if (fileSurface) fileSurface.style.display = 'none';
            const terminal = document.getElementById('terminal-surface');
            if (terminal) {
                terminal.classList.add('open');
                // Override the slide-in overlay positioning for terminal-only mode so it fills viewport.
                terminal.style.transform = 'none';
                terminal.style.width = '100%';
                terminal.style.left = '0';
            }
            // Terminal-only mode: hide file-browser-only toolbar controls (claude-htmx 2026-08-30).
            ['home-btn', 'up-btn', 'app-title', 'upload-btn', 'new-folder-btn', 'show-hidden-btn',
             'view-mode-list', 'view-mode-grid', 'view-mode-details', 'terminal-menu-wrapper']
                .forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            // Also hide the close-pane button — terminal is the only surface, no panel to collapse.
            const closePaneBtn = document.getElementById('close-terminal-btn');
            if (closePaneBtn) closePaneBtn.style.display = 'none';
            // Show and wire the back-to-browser button (was hidden via .hidden class).
            const backBtn = document.getElementById('back-to-browser-btn');
            if (backBtn) {
                backBtn.classList.remove('hidden');
                backBtn.addEventListener('click', () => {
                    window.location.href = window.location.pathname;
                });
            }
            // ponytail: also rename the tab so multi-tab users can tell file-browser from terminal tabs.
            document.title = 'Terminal — Web Terminal';
            // Body class activates the 2px accent top-border indicator and un-hides .terminal-only buttons.
            document.body.classList.add('terminal-only-mode');
            // Wire the Tier A header actions (font stepper, notify toggle, copy session).
            initTerminalOnlyExtras();
        }

        // Terminal menu dropdown — single button, two actions.
        if (terminalMenuBtn && terminalMenu) {
            terminalMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = terminalMenu.classList.toggle('hidden');
                terminalMenuBtn.setAttribute('aria-expanded', String(!isHidden));
            });
            terminalMenu.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = item.dataset.terminalAction;
                    if (action === 'side-panel') {
                        toggleTerminal();
                    } else if (action === 'new-tab') {
                        // ponytail: open a new tab to the same page with ?terminal=open;
                        // that flag hides the file browser and forces the terminal panel open.
                        window.open(window.location.pathname + '?terminal=open', '_blank');
                    }
                    terminalMenu.classList.add('hidden');
                    terminalMenuBtn.setAttribute('aria-expanded', 'false');
                });
            });
            // Click-outside closes.
            document.addEventListener('click', () => {
                terminalMenu.classList.add('hidden');
                terminalMenuBtn.setAttribute('aria-expanded', 'false');
            });
        }

        // Home button — navigate to ~/ and close terminal panel.
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                document.getElementById('current-path').value = '.';
                const terminal = document.getElementById('terminal-surface');
                if (terminal) terminal.classList.remove('open');
                htmx.trigger('#file-list', 'file-list-changed');
            });
        }

        // Up button — navigate to parent directory. Computes parent from current #current-path
        // value; disabled at home dir. Uses a path.dirname-equivalent that handles all edge
        // cases (single segment, trailing slash, empty, dot).
        function parentOfPath(p) {
            if (!p || p === '.' || p === '') return null;
            // Strip trailing slash if any (defensive — server doesn't send them but worth guarding).
            const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
            const lastSlash = trimmed.lastIndexOf('/');
            if (lastSlash === -1) {
                // Single segment with no slash (e.g. 'foo') — parent is the root '.'.
                return '.';
            }
            const parent = trimmed.slice(0, lastSlash);
            return parent === '' ? '.' : parent;
        }
        function syncUpButtonState() {
            if (!upBtn) return;
            upBtn.disabled = parentOfPath(document.getElementById('current-path').value) === null;
        }
        if (upBtn) {
            syncUpButtonState();
            // ponytail: disable Up button while a fetch is in flight so rapid double-clicks
            // don't skip levels. Re-enables on htmx:afterSwap.
            upBtn.addEventListener('htmx:beforeRequest', () => { upBtn.disabled = true; });
            document.body.addEventListener('htmx:afterSwap', (e) => {
                if (e.target.id === 'file-list') syncUpButtonState();
            });
            upBtn.addEventListener('click', () => {
                const cur = document.getElementById('current-path').value || '.';
                const parent = parentOfPath(cur);
                if (parent === null) return; // at root, no parent
                document.getElementById('current-path').value = parent;
                htmx.trigger('#file-list', 'file-list-changed');
            });
        }

        // Close-terminal button — slides the side panel back out (toggles the .open class).
        const closeTerminalBtn = document.getElementById('close-terminal-btn');
        if (closeTerminalBtn) {
            closeTerminalBtn.addEventListener('click', toggleTerminal);
        }

        // View modes — actually re-render #file-list with the chosen view.
        // The /files route accepts view=list|grid|details. htmx triggers a fresh fetch
        // with the new view param via a per-button hx-vals override on the hx-trigger.
        function setViewMode(view) {
            window.__fileListView = view;
            try { localStorage.setItem('web-terminal:view-mode', view); } catch (_) { /* ignore */ }
            document.querySelectorAll('.view-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.view === view);
            });
            // Toggle the CSS view class so grid styling kicks in even before server returns.
            if (fileList) {
                fileList.classList.remove('view-list', 'view-grid', 'view-details');
                fileList.classList.add('view-' + view);
            }
            htmx.trigger('#file-list', 'file-list-changed');
        }
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => setViewMode(btn.dataset.view));
        });
        // Restore last view mode from localStorage.
        try {
            const savedView = localStorage.getItem('web-terminal:view-mode');
            if (savedView && ['list', 'grid', 'details'].includes(savedView)) {
                window.__fileListView = savedView;
                document.querySelectorAll('.view-mode-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.view === savedView);
                });
                if (fileList) {
                    fileList.classList.add('view-' + savedView);
                }
            } else {
                window.__fileListView = 'list';
            }
        } catch (_) { window.__fileListView = 'list'; }
    }

    // --- TERMINAL-ONLY HEADER EXTRAS (Tier A) ---
    // Called from initOverlayLayout() only in ?terminal=open mode. Wires the font stepper,
    // job-finished notification toggle, and copy-session-info button.
    function initTerminalOnlyExtras() {
        // ----- Font-size stepper (Tier A #1) -----
        const FONT_MIN = 8, FONT_MAX = 24, FONT_STEP = 2, FONT_DEFAULT = 14;
        function currentFontSize() {
            const activeTab = tabs.find(t => t.id === activeTabId);
            return activeTab && activeTab.term ? activeTab.term.options.fontSize : FONT_DEFAULT;
        }
        function adjustFontSize(delta) {
            const next = Math.max(FONT_MIN, Math.min(FONT_MAX, currentFontSize() + delta));
            tabs.forEach((tab) => { tab.term.options.fontSize = next; if (tab.fitAddon) tab.fitAddon.fit(); });
            try { localStorage.setItem('web-terminal:font-size', String(next)); } catch (_) { /* ignore */ }
        }
        const fontDown = document.getElementById('font-decrease-btn');
        const fontUp = document.getElementById('font-increase-btn');
        if (fontDown) fontDown.addEventListener('click', () => adjustFontSize(-FONT_STEP));
        if (fontUp) fontUp.addEventListener('click', () => adjustFontSize(+FONT_STEP));
        // Restore last font size on tab creation. Modify createTab to apply persisted size.
        try {
            const saved = parseInt(localStorage.getItem('web-terminal:font-size'), 10);
            if (saved >= FONT_MIN && saved <= FONT_MAX) {
                tabs.forEach((tab) => { tab.term.options.fontSize = saved; });
            }
        } catch (_) { /* ignore */ }

        // ----- Copy session info (Tier A #2) -----
        // ponytail: copies hostname + active tab id to clipboard via navigator.clipboard.
        // Falls back to a textarea-select hack if the modern API is unavailable (e.g. http:// in some browsers).
        const copyBtn = document.getElementById('copy-session-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const hostname = window.location.hostname || 'localhost';
                const tabId = activeTabId || 'none';
                const text = `${hostname}:tab-${tabId}`;
                try {
                    if (navigator.clipboard && window.isSecureContext) {
                        await navigator.clipboard.writeText(text);
                    } else {
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        ta.remove();
                    }
                    flashTitle(`Copied: ${text}`);
                } catch (err) {
                    console.error('Copy failed:', err);
                    flashTitle('Copy failed');
                }
            });
        }

        // ----- Job-finished notification toggle (Tier A #3) -----
        // ponytail: simple detection via xterm onData + a 'still-busy' heuristic. When toggled ON,
        // we watch for prompt-shaped output (fish prints '➜ ' or '$ ' at idle). On long silence
        // break, flash document.title + (if granted) fire a Notification.
        const notifyBtn = document.getElementById('notify-btn');
        let notifyOn = false;
        let lastOutputAt = Date.now();
        let notifyPromptSeen = false;
        if (notifyBtn) {
            notifyBtn.addEventListener('click', async () => {
                notifyOn = !notifyOn;
                notifyBtn.setAttribute('aria-pressed', String(notifyOn));
                if (notifyOn) {
                    // Request Notification permission. Graceful if denied.
                    if ('Notification' in window && Notification.permission === 'default') {
                        await Notification.requestPermission();
                    }
                    flashTitle('Notify ON — will flash when shell idles');
                } else {
                    flashTitle('Notify OFF');
                }
            });
        }
        // Watch all tabs for output. When the gap between outputs exceeds NOTIFY_IDLE_MS, fire.
        const NOTIFY_IDLE_MS = 3000; // 3s of silence = shell likely done.
        setInterval(() => {
            if (!notifyOn) return;
            const idle = Date.now() - lastOutputAt;
            if (idle >= NOTIFY_IDLE_MS && !notifyPromptSeen) {
                notifyPromptSeen = true;
                flashTitle('Shell idle — job may be done');
                if ('Notification' in window && Notification.permission === 'granted') {
                    try { new Notification('Web Terminal', { body: 'Shell prompt returned \u2014 check your job.' }); }
                    catch (_) { /* ignore */ }
                }
            }
        }, 1000);
        // Hook tab onData (added in createTab) to bump lastOutputAt. We monkey-patch the array
        // forEach here so future tabs also pick it up.
        tabs.forEach((tab) => {
            if (tab.term && !tab._notifyPatched) {
                const origOnData = tab.term.onData.bind(tab.term);
                tab.term.onData((data) => { lastOutputAt = Date.now(); notifyPromptSeen = false; origOnData(data); });
                tab._notifyPatched = true;
            }
        });
        // Future tabs: patch in createTab's tab-creation code path. Minimal: re-scan every interval.
        setInterval(() => {
            tabs.forEach((tab) => {
                if (tab.term && !tab._notifyPatched) {
                    const origOnData = tab.term.onData.bind(tab.term);
                    tab.term.onData((data) => { lastOutputAt = Date.now(); notifyPromptSeen = false; origOnData(data); });
                    tab._notifyPatched = true;
                }
            });
        }, 2000);
    }

    // ponytail: flash the document.title to surface async events (copy success, notify toggle).
    // Restores the original title after 3 seconds.
    function flashTitle(msg) {
        const original = document.title;
        document.title = msg;
        setTimeout(() => { document.title = original; }, 3000);
    }

    // --- INITIALIZATION CALLS ---
    fetchHomeDir();
    populateThemes();
    // ponytail: initOverlayLayout() MUST run before createTab() so #terminal-surface
    // is at its terminal-only-mode final dimensions (width:100%, transform:none)
    // when createTab's synchronous switchToTab() calls fitAddon.fit(). Otherwise
    // xterm fits to the off-screen 50vw default size and the first tab renders
    // invisibly until some later unrelated event forces a full repaint.
    // Diagnosed by claude-htmx 2026-08-30 (second round).
    initOverlayLayout();
    createTab(); // Create the first tab on load
});
