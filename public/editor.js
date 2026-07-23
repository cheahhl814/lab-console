document.addEventListener('DOMContentLoaded', () => {
    const filePathEl = document.getElementById('file-path');
    const editorEl = document.getElementById('editor');
    const saveBtn = document.getElementById('save-btn');
    const commandsBtn = document.getElementById('commands-btn');
    const themeSelect = document.getElementById('theme-select');
    const statusEl = document.getElementById('status');
    // Settings Modal Elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const fontSizeInput = document.getElementById('font-size-input');
    const minimapCheckbox = document.getElementById('minimap-checkbox');

    let isDirty = false;
    let originalTitle = document.title;

    function updateTitleAndDirtyState(dirtyStatus) {
        isDirty = dirtyStatus;
        if (isDirty) {
            document.title = `* ${originalTitle}`;
        } else {
            document.title = originalTitle;
        }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const filePath = urlParams.get('path');
    let editor;

    // --- Settings State ---
    let editorSettings = {
        fontSize: 14,
        minimap: {
            enabled: false
        }
    };

    // --- Settings Modal Logic ---
    settingsBtn.addEventListener('click', () => {
        // Update inputs to reflect current settings
        fontSizeInput.value = editorSettings.fontSize;
        minimapCheckbox.checked = editorSettings.minimap.enabled;
        settingsModal.style.display = 'flex';
    });

    modalCloseBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    if (!filePath) {
        filePathEl.textContent = 'Error: No file path provided.';
        saveBtn.disabled = true;
        return;
    }

    filePathEl.textContent = `Editing: ~/${filePath}`;
    originalTitle = `Editing: ${filePath.split('/').pop()}`; // Set initial title based on filename
    updateTitleAndDirtyState(false); // Initialize title (not dirty)

    // Initialize Monaco Editor
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.20.0/min/vs' }});
    require(['vs/editor/editor.main'], function() {
        editor = monaco.editor.create(editorEl, {
            theme: 'vs-dark',
            language: 'javascript', // Default language, will be updated based on file extension
            folding: true,
            showFoldingControls: 'always',
            ...editorSettings // Apply initial settings
        });

        // Track changes
        editor.getModel().onDidChangeContent(() => updateTitleAndDirtyState(true));

        // --- Attach button event listeners now that editor is created ---
        commandsBtn.addEventListener('click', () => {
            editor.trigger('source', 'editor.action.quickCommand');
        });

        themeSelect.addEventListener('change', () => {
            monaco.editor.setTheme(themeSelect.value);
        });

        // --- Settings Change Handlers ---
        fontSizeInput.addEventListener('change', () => {
            const newSize = parseInt(fontSizeInput.value, 10);
            if (newSize >= 10 && newSize <= 30) {
                editorSettings.fontSize = newSize;
                editor.updateOptions(editorSettings);
            }
        });

        minimapCheckbox.addEventListener('change', () => {
            editorSettings.minimap.enabled = minimapCheckbox.checked;
            editor.updateOptions(editorSettings);
        });

        saveBtn.addEventListener('click', () => {
            const content = editor.getValue();
            statusEl.textContent = 'Saving...';

            fetch('/save-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: content })
            })
            .then(response => {
                if (!response.ok) return Promise.reject('Failed to save file.');
                return response.text();
            })
            .then(result => {
                statusEl.textContent = `${result} (${new Date().toLocaleTimeString()})`;
                updateTitleAndDirtyState(false); // Mark as clean after successful save
            })
            .catch(error => {
                statusEl.textContent = error;
            });
        });

        // Fetch file content on load
        fetch(`/get-content?path=${encodeURIComponent(filePath)}`)
            .then(response => {
                if (!response.ok) return Promise.reject('Failed to load file.');
                return response.text();
            })
            .then(content => {
                editor.setValue(content);
                const extension = filePath.split('.').pop();
                const language = getLanguageFromExtension(extension);
                monaco.editor.setModelLanguage(editor.getModel(), language);
                updateTitleAndDirtyState(false); // Ensure clean state after initial load
            })
            .catch(error => {
                statusEl.textContent = error;
                saveBtn.disabled = true;
            });
    });

    // Prompt user before closing if there are unsaved changes
    window.onbeforeunload = (event) => {
        if (isDirty) {
            // Standard for most browsers to show a generic message
            event.preventDefault(); // For older browsers
            event.returnValue = ''; // For modern browsers
            return ''; // For some older browsers
        }
    };

    function getLanguageFromExtension(extension) {
        switch (extension) {
            case 'js':
                return 'javascript';
            case 'ts':
                return 'typescript';
            case 'json':
                return 'json';
            case 'html':
                return 'html';
            case 'css':
                return 'css';
            case 'md':
                return 'markdown';
            case 'py':
                return 'python';
            case 'sh':
                return 'shell';
            case 'java':
                return 'java';
            case 'c':
                return 'c';
            case 'cpp':
                return 'cpp';
            case 'go':
                return 'go';
            case 'rs':
                return 'rust';
            case 'smk':
                return 'python'; // Snakemake is Python-based
            case 'nf':
                return 'java'; // Nextflow is Groovy-based, using Java for partial highlighting
            default:
                return 'plaintext';
        }
    }
});
