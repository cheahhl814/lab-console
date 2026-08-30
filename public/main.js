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
    const themeSelect = document.getElementById('theme-select');
    const contextMenu = document.getElementById('context-menu');
    const contextMenuItemDownload = document.getElementById('context-menu-item-download');
    const tabBar = document.getElementById('tab-bar');
    const newTabBtn = document.getElementById('new-tab-btn');
    const terminalViews = document.getElementById('terminal-views');

    // --- FUNCTION DEFINITIONS ---

    function populateThemes() {
        for (const themeName in themes) {
            const option = document.createElement('option');
            option.value = themeName;
            option.textContent = themeName;
            themeSelect.appendChild(option);
        }
        themeSelect.value = activeTheme;
        document.documentElement.dataset.theme = activeTheme;
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

    // THEME EVENT LISTENER
    themeSelect.addEventListener('change', () => {
        activeTheme = themeSelect.value;
        document.documentElement.dataset.theme = activeTheme;
        const theme = themes[activeTheme];
        tabs.forEach(tab => tab.term.options.theme = theme);
    });

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

        const targetLi = e.target.closest('li');

        // Show/hide menu items based on context
        if (targetLi && !targetLi.textContent.includes('.. (Up)')) {
            // Clicked on a file or folder
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
        const targetLi = e.target.closest('li');
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
        const toggleBtn = document.getElementById('toggle-terminal-btn');
        if (toggleBtn) toggleBtn.addEventListener('click', toggleTerminal);

        // Phase 0.2 stub: view-mode buttons just toggle the .active class for now.
        // The actual view-mode rendering lands in Phase 0.2.
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const view = btn.dataset.view;
                // Persist the user's choice in localStorage so Phase 0.2 can read it.
                try { localStorage.setItem('web-terminal:view-mode', view); } catch (_) { /* ignore */ }
                // No-op visual stub: the file-list will re-render in Phase 0.2 via htmx trigger.
            });
        });
    }

    // --- INITIALIZATION CALLS ---
    fetchHomeDir();
    populateThemes();
    createTab(); // Create the first tab on load

    // ponytail: Split.js removed (2026-08-30 Phase 0.1) — terminal is now a slide-in overlay panel,
    // not a flex-row peer of the file browser. See docs/superpowers/plans/2026-08-30-ui-improvements-and-features.md.
    initOverlayLayout();
});
