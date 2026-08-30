const express = require('express');
const expressWs = require('express-ws');
const pty = require('node-pty');
const os = require('os');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const basicAuth = require('express-basic-auth');
const si = require('systeminformation');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

const userHomeDir = os.homedir();

// Real containment check: a raw path.startsWith(userHomeDir) is a substring test, so
// "/home/user2" would incorrectly pass as being inside "/home/user". Compare via
// path.relative instead and reject any escape (a relative path starting with "..").
function isPathWithinHome(candidatePath) {
    if (candidatePath === userHomeDir) return true;
    const rel = path.relative(userHomeDir, candidatePath);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// --- HPC STATS COMMANDS CONFIGURATION ---
// This command should show the status of the current user's jobs.
const hpcCommands = {
    jobs: "squeue --me -o '%.2t'"
};

const fishConfigDir = path.join(os.homedir(), '.config', 'fish');
const fishConfigFile = path.join(fishConfigDir, 'config.fish');
const greetingSetting = '\nset -g -x fish_greeting ""\n';

fs.mkdir(fishConfigDir, { recursive: true }, (err) => {
    if (err) {
        logger.error({ err }, 'Failed to create fish config directory');
        return;
    }
    fs.readFile(fishConfigFile, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File doesn't exist, create it
                fs.writeFile(fishConfigFile, greetingSetting, (err) => {
                    if (err) {
                        logger.error({ err }, 'Failed to create fish config file');
                    }
                });
            } else {
                logger.error({ err }, 'Failed to read fish config file');
            }
        } else {
            // File exists, check if setting is already there
            if (!data.includes('fish_greeting')) {
                fs.appendFile(fishConfigFile, greetingSetting, (err) => {
                    if (err) {
                        logger.error({ err }, 'Failed to write to fish config file');
                    }
                });
            }
        }
    });
});

const app = express();

// contentSecurityPolicy is left off: htmx's hx-vals="js:...} evaluates expressions via
// `new Function` (public/index.html), and Monaco (public/editor.js) relies on web
// workers/blobs — a default CSP would break both. Other helmet protections (frame
// options, no-sniff, HSTS when serving over HTTPS, etc.) stay enabled.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // htmx.ajax POSTs form-urlencoded bodies
expressWs(app);

if (!process.env.AUTH_USER || !process.env.AUTH_PASS) {
    logger.error('AUTH_USER and AUTH_PASS environment variables must be set. Refusing to start.');
    process.exit(1);
}

// Applied before auth so it also mitigates basic-auth brute-forcing, not just mutation
// spam. Generous enough for normal usage (status-bar polling is one request/5s).
app.use(rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 300,
    standardHeaders: true,
    legacyHeaders: false
}));

app.use(basicAuth({
    users: { [process.env.AUTH_USER]: process.env.AUTH_PASS },
    challenge: true,
    unauthorizedResponse: 'Unauthorized access.'
}));

app.get('/api/home', (req, res) => {
    res.send(userHomeDir);
});

// --- FILE SYSTEM MUTATION ENDPOINTS ---

app.post('/create-file', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!isPathWithinHome(fullPath)) return res.status(403).send('Forbidden');
    fs.writeFile(fullPath, '', (err) => {
        if (err) return res.status(500).send('Failed to create file.');
        res.set('HX-Trigger', 'file-list-changed').send('File created.');
    });
});

app.post('/create-folder', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!isPathWithinHome(fullPath)) return res.status(403).send('Forbidden');
    fs.mkdir(fullPath, { recursive: true }, (err) => {
        if (err) return res.status(500).send('Failed to create folder.');
        res.set('HX-Trigger', 'file-list-changed').send('Folder created.');
    });
});

app.post('/rename-item', (req, res) => {
    const oldPath = path.resolve(userHomeDir, req.body.oldPath);
    const newPath = path.resolve(userHomeDir, req.body.newPath);
    if (!isPathWithinHome(oldPath) || !isPathWithinHome(newPath)) {
        return res.status(403).send('Forbidden');
    }
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).send('Failed to rename.');
        res.set('HX-Trigger', 'file-list-changed').send('Renamed successfully.');
    });
});

app.post('/delete-item', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!isPathWithinHome(fullPath) || fullPath === userHomeDir) {
        return res.status(403).send('Forbidden'); // Prevent deleting home dir
    }
    fs.rm(fullPath, { recursive: true, force: true }, (err) => {
        if (err) return res.status(500).send('Failed to delete.');
        res.set('HX-Trigger', 'file-list-changed').send('Deleted successfully.');
    });
});

function copyRecursiveSync(src, dest) {
    const stats = fs.statSync(src);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function getUniquePath(originalPath) {
    const parsedPath = path.parse(originalPath);
    let newPath = path.join(parsedPath.dir, `${parsedPath.name}_copy${parsedPath.ext}`);
    let counter = 2;
    while (fs.existsSync(newPath)) {
        newPath = path.join(parsedPath.dir, `${parsedPath.name}_copy${counter}${parsedPath.ext}`);
        counter++;
    }
    return newPath;
}

app.post('/paste-item', (req, res) => {
    const sourcePath = path.resolve(userHomeDir, req.body.sourcePath);
    const destinationPath = path.resolve(userHomeDir, req.body.destinationPath);

    if (!isPathWithinHome(sourcePath) || !isPathWithinHome(destinationPath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const destWithFilename = path.join(destinationPath, path.basename(sourcePath));
        copyRecursiveSync(sourcePath, destWithFilename);
        res.set('HX-Trigger', 'file-list-changed').send('Item pasted successfully.');
    } catch (error) {
        logger.error({ err: error }, 'Paste error');
        res.status(500).send('Failed to paste item.');
    }
});

app.post('/move-item', (req, res) => {
    const sourcePath = path.resolve(userHomeDir, req.body.sourcePath);
    const destinationPath = path.resolve(userHomeDir, req.body.destinationPath);

    if (!isPathWithinHome(sourcePath) || !isPathWithinHome(destinationPath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const destWithFilename = path.join(destinationPath, path.basename(sourcePath));
        fs.renameSync(sourcePath, destWithFilename);
        res.set('HX-Trigger', 'file-list-changed').send('Item moved successfully.');
    } catch (error) {
        logger.error({ err: error }, 'Move error');
        res.status(500).send('Failed to move item.');
    }
});

app.post('/duplicate-item', (req, res) => {
    const sourcePath = path.resolve(userHomeDir, req.body.sourcePath);
    if (!isPathWithinHome(sourcePath)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const newPath = getUniquePath(sourcePath);
        copyRecursiveSync(sourcePath, newPath);
        res.set('HX-Trigger', 'file-list-changed').send('Item duplicated successfully.');
    } catch (error) {
        logger.error({ err: error }, 'Duplicate error');
        res.status(500).send('Failed to duplicate item.');
    }
});

// Multer storage configuration for uploads
const uploadTmpDir = path.join(os.tmpdir(), 'web_terminal_uploads');
fs.mkdirSync(uploadTmpDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadTmpDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const upload = multer({
    storage: storage,
    limits: {
        fileSize: (Number(process.env.UPLOAD_MAX_FILE_SIZE_MB) || 200) * 1024 * 1024,
        files: Number(process.env.UPLOAD_MAX_FILES) || 20
    }
});


// --- EDITOR ENDPOINTS ---
app.get('/get-content', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.query.path);
    if (!isPathWithinHome(fullPath)) return res.status(403).send('Forbidden');
    fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Failed to read file.');
        res.send(data);
    });
});

app.post('/save-content', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!isPathWithinHome(fullPath)) return res.status(403).send('Forbidden');
    fs.writeFile(fullPath, req.body.content, 'utf8', (err) => {
        if (err) return res.status(500).send('Failed to save file.');
        res.send('File saved successfully.');
    });
});


// --- READ-ONLY ENDPOINTS ---

app.get('/view-file', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.query.path);
    if (!isPathWithinHome(fullPath)) return res.status(403).send('Forbidden');
    res.sendFile(fullPath, (err) => {
        if (err) {
            res.status(err.status || 500).send('Could not send file.');
        }
    });
});

// Endpoint for file uploads
app.post('/upload', upload.any(), (req, res) => {
    const targetDestination = path.resolve(userHomeDir, req.body.destination || '.');

    if (!isPathWithinHome(targetDestination)) {
        return res.status(403).send('Forbidden: Target path is outside the home directory.');
    }

    fs.mkdirSync(targetDestination, { recursive: true });

    if (req.files && req.files.length > 0) {
        let errors = [];
        req.files.forEach(file => {
            const tempPath = file.path;
            const finalPath = path.join(targetDestination, file.originalname);
            try {
                fs.copyFileSync(tempPath, finalPath);
                fs.unlinkSync(tempPath); // Delete the temporary file
            } catch (err) {
                logger.error({ err }, 'Error moving or deleting file');
                errors.push(`Failed to process file ${file.originalname}: ${err.message}`);
            }
        });

        if (errors.length > 0) {
            return res.status(500).send('Some files failed to upload: ' + errors.join('; '));
        }
        res.set('HX-Trigger', 'file-list-changed').send('File(s) uploaded and moved successfully.');
    } else {
        res.status(400).send('No files uploaded.');
    }
});

// Endpoint for file downloads
app.get('/download', (req, res) => {
    const requestedPath = path.resolve(userHomeDir, req.query.path);
    if (!isPathWithinHome(requestedPath)) {
        return res.status(403).send('Forbidden: Access denied.');
    }
    res.download(requestedPath);
});

// Endpoint for folder downloads (as ZIP)
app.get('/download-zip', (req, res) => {
    const requestedPath = path.resolve(userHomeDir, req.query.path);
    if (!isPathWithinHome(requestedPath)) {
        return res.status(403).send('Forbidden: Access denied.');
    }

    const folderName = path.basename(requestedPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    res.attachment(`${folderName}.zip`);
    archive.pipe(res);
    archive.directory(requestedPath, false);
    archive.finalize();
});

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function renderFileListFragment({ currentPath, parentPath, entries }, view = 'list') {
    const viewableExtensions = /\.(html|htm|png|jpg|jpeg|gif|svg|webp|pdf)$/i;
    const editableExtensions = /\.(txt|js|json|md|css|sh|py|java|c|cpp|go|rs)$/i;

    // ponytail: details view uses the SAME <li> markup as list/grid. CSS Grid columns
    // lay out size/mtime/type. No <table> inside <ul> (invalid HTML; browsers auto-close
    // the <ul> before the <table>, breaking the .view-details CSS target).
    // 2026-08-30: removed the '.. (Up)' row that the server used to emit as the first <li>.
    // Parent navigation now lives in the toolbar Up button (#up-btn).
    if (view === 'details') {
        let html = '';
        for (const entry of entries) {
            const entryPath = `${currentPath}/${entry.name}`;
            const escapedName = escapeHtml(entry.name);
            const escapedPath = escapeHtml(entryPath);
            const icon = entry.type === 'directory' ? '&#128194;' : '&#128196;';
            const size = entry.size == null ? '\u2014' : humanSize(entry.size);
            const mtime = entry.mtime ? entry.mtime.slice(0, 10) : '\u2014';
            const type = entry.type === 'directory' ? 'Folder' : 'File';
            const navAttrs = entry.type === 'directory'
                ? `hx-get="/files" hx-vals="${escapeHtml(JSON.stringify({ path: entryPath, view: 'details' }))}" hx-target="#file-list" hx-swap="innerHTML" hx-include="#show-hidden-checkbox"`
                : '';
            const dataAction = entry.type === 'directory' ? '' :
                (viewableExtensions.test(entry.name) ? 'view' : editableExtensions.test(entry.name) ? 'edit' : '');
            const onClick = !navAttrs && dataAction
                ? (dataAction === 'view'
                    ? ` onclick="window.open('/view-file?path=' + encodeURIComponent('${escapedPath}'), '_blank')"`
                    : ` onclick="window.open('editor.html?path=' + encodeURIComponent('${escapedPath}'), '_blank')"`)
                : '';
            html += `<li class="${entry.type}" ${navAttrs} data-path="${escapedPath}" data-type="${entry.type}" ${dataAction ? `data-action="${dataAction}"` : ''}${onClick}>`;
            html += `<span class="col-name"><span class="file-icon">${icon}</span> <span class="file-name">${escapedName}</span></span>`;
            html += `<span class="col-size">${size}</span>`;
            html += `<span class="col-mtime">${mtime}</span>`;
            html += `<span class="col-type">${type}</span>`;
            html += '</li>';
        }
        return html;
    }

    let html = '';
    // ponytail: removed the '.. (Up)' list row that the server used to emit (2026-08-30).
    // Parent navigation is now the toolbar #up-btn. The Up button computes the parent
    // client-side and triggers the same htmx fragment request the row used to make.
    for (const entry of entries) {
        const entryPath = `${currentPath}/${entry.name}`;
        const icon = entry.type === 'directory' ? '&#128194;' : '&#128196;';
        const escapedName = escapeHtml(entry.name);
        const escapedPath = escapeHtml(entryPath);

        if (entry.type === 'directory') {
            html += `<li class="directory" data-path="${escapedPath}" data-type="directory" hx-get="/files" hx-vals="${escapeHtml(JSON.stringify({ path: entryPath, view }))}" hx-target="#file-list" hx-swap="innerHTML" hx-include="#show-hidden-checkbox"><span class="file-icon">${icon}</span> <span class="file-name">${escapedName}</span></li>`;
        } else if (viewableExtensions.test(entry.name)) {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" data-action="view"><span class="file-icon">${icon}</span> <span class="file-name">${escapedName}</span></li>`;
        } else if (editableExtensions.test(entry.name)) {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" data-action="edit"><span class="file-icon">${icon}</span> <span class="file-name">${escapedName}</span></li>`;
        } else {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" style="cursor:default"><span class="file-icon">${icon}</span> <span class="file-name">${escapedName}</span></li>`;
        }
    }
    return html;
}

// ponytail: human-readable size for details view. Bytes, KB, MB, GB.
function humanSize(bytes) {
    if (bytes == null) return '\u2014';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let val = bytes / 1024;
    for (const unit of units) {
        if (val < 1024) return val.toFixed(1) + ' ' + unit;
        val /= 1024;
    }
    return val.toFixed(1) + ' PB';
}

app.get('/files', (req, res) => {
    const requestedPath = req.query.path ? path.resolve(userHomeDir, req.query.path) : userHomeDir;
    const showHidden = req.query.showHidden === 'true';
    const view = ['list', 'grid', 'details'].includes(req.query.view) ? req.query.view : 'list';

    // Security Check: Ensure the path is within the user's home directory
    if (!isPathWithinHome(requestedPath)) {
        return res.status(403).send('Forbidden: Access denied.');
    }

    fs.readdir(requestedPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            return res.status(500).send('Error reading directory');
        }

        const promises = entries.map(entry => {
            return new Promise((resolve) => {
                const fullPath = path.join(requestedPath, entry.name);
                // ponytail: parallel stats (Promise.all over fs.readdir) — claude-htmx review 2026-08-30.
                fs.stat(fullPath, (statErr, stats) => {
                    // If stat fails, it might be a broken symlink, so we treat it as a file.
                    const type = (!statErr && stats.isDirectory()) ? 'directory' : 'file';
                    // ponytail: enrich processedFiles with size + mtime for details/grid views.
                    // Only included for views that need them; list view ignores them.
                    resolve({
                        name: entry.name,
                        type: type,
                        size: statErr ? null : stats.size,
                        mtime: statErr ? null : stats.mtime.toISOString()
                    });
                });
            });
        });

        Promise.all(promises).then(files => {
            const parentDir = path.dirname(path.relative(userHomeDir, requestedPath) || '.');
            const processedFiles = showHidden ? files : files.filter(file => !file.name.startsWith('.'));

            const relCurrentPath = path.relative(userHomeDir, requestedPath) || '.';
            const data = {
                currentPath: relCurrentPath,
                parentPath: requestedPath === userHomeDir ? null : parentDir,
                entries: processedFiles.sort((a, b) => {
                    if (a.type === b.type) return a.name.localeCompare(b.name);
                    return a.type === 'directory' ? -1 : 1;
                })
            };

            const listHtml = renderFileListFragment(data, view);
            const oob = `<span id="file-browser-header-text" hx-swap-oob="true">~/${escapeHtml(relCurrentPath)}</span>` +
                        `<input type="hidden" id="current-path" hx-swap-oob="true" value="${escapeHtml(relCurrentPath)}">`;
            res.set('Content-Type', 'text/html').send(listHtml + oob);
        }).catch(err => {
            logger.error({ err }, 'Error reading file stats');
            res.status(500).send("Error reading file stats");
        });
    });
});

const { version } = require('./package.json');

app.get('/system-stats', async (req, res) => {
    try {
        const [cpu, mem, gpu] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.graphics()
        ]);

        const simplifiedGpu = {
            controllers: gpu.controllers.map(c => ({
                vendor: c.vendor,
                model: c.model,
                utilization: c.utilizationGpu,
                memoryUsed: c.memoryUsed,
                memoryTotal: c.memoryTotal
            }))
        };

        const actualUsedMem = mem.total - mem.available;
        const actualUsedPercent = ((actualUsedMem / mem.total) * 100).toFixed(2);

        const usedGb = (actualUsedMem / 1024 / 1024 / 1024).toFixed(2);
        const totalGb = (mem.total / 1024 / 1024 / 1024).toFixed(2);
        let gpuText = 'N/A';
        if (simplifiedGpu.controllers.length > 0) {
            const g = simplifiedGpu.controllers[0];
            const vram = g.memoryTotal ? `(${(g.memoryUsed / g.memoryTotal * 100).toFixed(0)}%)` : '';
            gpuText = `${g.model}: ${g.utilization || 0}% ${vram}`;
        }

        res.set('Content-Type', 'text/html').send(
            `<span id="version-stat-value" hx-swap-oob="true">${version}</span>` +
            `<span id="cpu-stat-value" hx-swap-oob="true">${cpu.currentLoad.toFixed(2)}%</span>` +
            `<span id="ram-stat-value" hx-swap-oob="true">${usedGb}GB / ${totalGb}GB (${actualUsedPercent}%)</span>` +
            `<span id="gpu-stat-value" hx-swap-oob="true">${gpuText}</span>`
        );
    } catch (error) {
        logger.error({ err: error }, 'Error fetching system stats');
        res.status(500).json({ error: 'Failed to fetch system stats' });
    }
});



const shell = os.platform() === 'win32' ? 'powershell.exe' : 'fish';

app.use('/node_modules', express.static(__dirname + '/node_modules'));
app.use(express.static(__dirname + '/public'));

app.ws('/ws', (ws, req) => {
    const term = pty.spawn(shell, [], {
        name: 'xterm',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    term.on('data', (data) => {
        ws.send(data);
    });

    ws.on('message', (msg) => {
        try {
            const { cols, rows } = JSON.parse(msg);
            term.resize(cols, rows);
        } catch (e) {
            term.write(msg);
        }
    });

    ws.on('close', () => {
        term.kill();
    });
});

// Final error handler: catches anything thrown/passed to next() by routes above.
// Must be registered last. Logs the real error server-side but never leaks stack
// traces or file paths to the client.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
        logger.warn({ err }, 'Upload rejected');
        return res.status(413).send(`Upload rejected: ${err.message}`);
    }
    logger.error({ err }, 'Unhandled error');
    res.status(500).send('Internal server error.');
});

function getLanAddress() {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let alias of interfaces[iface]) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

// Only bind a real listener when run directly (`node server.js`), not when required
// as a module (e.g. by tests using supertest against the exported app).
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const { TLS_CERT_PATH, TLS_KEY_PATH } = process.env;
    if (TLS_CERT_PATH && TLS_KEY_PATH) {
        const https = require('https');
        const options = {
            cert: fs.readFileSync(TLS_CERT_PATH),
            key: fs.readFileSync(TLS_KEY_PATH)
        };
        https.createServer(options, app).listen(port, '0.0.0.0', () => {
            logger.info(`Server listening on https://${getLanAddress()}:${port}`);
        });
    } else {
        logger.warn(
            'WARNING: TLS_CERT_PATH/TLS_KEY_PATH not set — serving over plain HTTP. ' +
            'Credentials and terminal traffic are unencrypted on the wire. ' +
            'Set both env vars to enable HTTPS before exposing this beyond localhost/a trusted network.'
        );
        app.listen(port, '0.0.0.0', () => {
            logger.info(`Server listening on http://${getLanAddress()}:${port}`);
        });
    }
}

module.exports = app;
