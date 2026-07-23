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

const userHomeDir = os.homedir();

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
        console.error('Failed to create fish config directory:', err);
        return;
    }
    fs.readFile(fishConfigFile, 'utf8', (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File doesn't exist, create it
                fs.writeFile(fishConfigFile, greetingSetting, (err) => {
                    if (err) {
                        console.error('Failed to create fish config file:', err);
                    }
                });
            } else {
                console.error('Failed to read fish config file:', err);
            }
        } else {
            // File exists, check if setting is already there
            if (!data.includes('fish_greeting')) {
                fs.appendFile(fishConfigFile, greetingSetting, (err) => {
                    if (err) {
                        console.error('Failed to write to fish config file:', err);
                    }
                });
            }
        }
    });
});

const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
expressWs(app);

// IMPORTANT: In a real application, use a more secure way to manage users and passwords.
// Do not hardcode credentials directly in the code.
app.use(basicAuth({
    users: { 'mumgp': 'REDACTED' },
    challenge: true,
    unauthorizedResponse: 'Unauthorized access.'
}));

app.get('/api/home', (req, res) => {
    res.send(userHomeDir);
});

// --- FILE SYSTEM MUTATION ENDPOINTS ---

app.post('/create-file', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!fullPath.startsWith(userHomeDir)) return res.status(403).send('Forbidden');
    fs.writeFile(fullPath, '', (err) => {
        if (err) return res.status(500).send('Failed to create file.');
        res.send('File created.');
    });
});

app.post('/create-folder', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!fullPath.startsWith(userHomeDir)) return res.status(403).send('Forbidden');
    fs.mkdir(fullPath, { recursive: true }, (err) => {
        if (err) return res.status(500).send('Failed to create folder.');
        res.send('Folder created.');
    });
});

app.post('/rename-item', (req, res) => {
    const oldPath = path.resolve(userHomeDir, req.body.oldPath);
    const newPath = path.resolve(userHomeDir, req.body.newPath);
    if (!oldPath.startsWith(userHomeDir) || !newPath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden');
    }
    fs.rename(oldPath, newPath, (err) => {
        if (err) return res.status(500).send('Failed to rename.');
        res.send('Renamed successfully.');
    });
});

app.post('/delete-item', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!fullPath.startsWith(userHomeDir) || fullPath === userHomeDir) {
        return res.status(403).send('Forbidden'); // Prevent deleting home dir
    }
    fs.rm(fullPath, { recursive: true, force: true }, (err) => {
        if (err) return res.status(500).send('Failed to delete.');
        res.send('Deleted successfully.');
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

    if (!sourcePath.startsWith(userHomeDir) || !destinationPath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const destWithFilename = path.join(destinationPath, path.basename(sourcePath));
        copyRecursiveSync(sourcePath, destWithFilename);
        res.send('Item pasted successfully.');
    } catch (error) {
        console.error('Paste error:', error);
        res.status(500).send('Failed to paste item.');
    }
});

app.post('/move-item', (req, res) => {
    const sourcePath = path.resolve(userHomeDir, req.body.sourcePath);
    const destinationPath = path.resolve(userHomeDir, req.body.destinationPath);

    if (!sourcePath.startsWith(userHomeDir) || !destinationPath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const destWithFilename = path.join(destinationPath, path.basename(sourcePath));
        fs.renameSync(sourcePath, destWithFilename);
        res.send('Item moved successfully.');
    } catch (error) {
        console.error('Move error:', error);
        res.status(500).send('Failed to move item.');
    }
});

app.post('/duplicate-item', (req, res) => {
    const sourcePath = path.resolve(userHomeDir, req.body.sourcePath);
    if (!sourcePath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden');
    }

    try {
        const newPath = getUniquePath(sourcePath);
        copyRecursiveSync(sourcePath, newPath);
        res.send('Item duplicated successfully.');
    } catch (error) {
        console.error('Duplicate error:', error);
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
const upload = multer({ storage: storage });


// --- EDITOR ENDPOINTS ---
app.get('/get-content', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.query.path);
    if (!fullPath.startsWith(userHomeDir)) return res.status(403).send('Forbidden');
    fs.readFile(fullPath, 'utf8', (err, data) => {
        if (err) return res.status(500).send('Failed to read file.');
        res.send(data);
    });
});

app.post('/save-content', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.body.path);
    if (!fullPath.startsWith(userHomeDir)) return res.status(403).send('Forbidden');
    fs.writeFile(fullPath, req.body.content, 'utf8', (err) => {
        if (err) return res.status(500).send('Failed to save file.');
        res.send('File saved successfully.');
    });
});


// --- READ-ONLY ENDPOINTS ---

app.get('/view-file', (req, res) => {
    const fullPath = path.resolve(userHomeDir, req.query.path);
    if (!fullPath.startsWith(userHomeDir)) return res.status(403).send('Forbidden');
    res.sendFile(fullPath, (err) => {
        if (err) {
            res.status(err.status || 500).send('Could not send file.');
        }
    });
});

// Endpoint for file uploads
app.post('/upload', upload.any(), (req, res) => {
    const targetDestination = path.resolve(userHomeDir, req.body.destination || '.');

    if (!targetDestination.startsWith(userHomeDir)) {
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
                console.error('Error moving or deleting file:', err);
                errors.push(`Failed to process file ${file.originalname}: ${err.message}`);
            }
        });

        if (errors.length > 0) {
            return res.status(500).send('Some files failed to upload: ' + errors.join('; '));
        }
        res.send('File(s) uploaded and moved successfully.');
    } else {
        res.status(400).send('No files uploaded.');
    }
});

// Endpoint for file downloads
app.get('/download', (req, res) => {
    const requestedPath = path.resolve(userHomeDir, req.query.path);
    if (!requestedPath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden: Access denied.');
    }
    res.download(requestedPath);
});

// Endpoint for folder downloads (as ZIP)
app.get('/download-zip', (req, res) => {
    const requestedPath = path.resolve(userHomeDir, req.query.path);
    if (!requestedPath.startsWith(userHomeDir)) {
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

function renderFileListFragment({ currentPath, parentPath, entries }) {
    const viewableExtensions = /\.(html|htm|png|jpg|jpeg|gif|svg|webp|pdf)$/i;
    const editableExtensions = /\.(txt|js|json|md|css|sh|py|java|c|cpp|go|rs)$/i;

    let html = '';
    if (parentPath !== null) {
        html += `<li class="directory" hx-get="/files" hx-vals="${escapeHtml(JSON.stringify({ path: parentPath }))}" hx-target="#file-list" hx-swap="innerHTML" hx-include="#show-hidden-checkbox">&#128194; .. (Up)</li>`;
    }

    for (const entry of entries) {
        const entryPath = `${currentPath}/${entry.name}`;
        const icon = entry.type === 'directory' ? '&#128194;' : '&#128196;';
        const escapedName = escapeHtml(entry.name);
        const escapedPath = escapeHtml(entryPath);

        if (entry.type === 'directory') {
            html += `<li class="directory" data-path="${escapedPath}" data-type="directory" hx-get="/files" hx-vals="${escapeHtml(JSON.stringify({ path: entryPath }))}" hx-target="#file-list" hx-swap="innerHTML" hx-include="#show-hidden-checkbox">${icon} ${escapedName}</li>`;
        } else if (viewableExtensions.test(entry.name)) {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" data-action="view">${icon} ${escapedName}</li>`;
        } else if (editableExtensions.test(entry.name)) {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" data-action="edit">${icon} ${escapedName}</li>`;
        } else {
            html += `<li class="file" data-path="${escapedPath}" data-type="file" style="cursor:default">${icon} ${escapedName}</li>`;
        }
    }
    return html;
}

app.get('/files', (req, res) => {
    const requestedPath = req.query.path ? path.resolve(userHomeDir, req.query.path) : userHomeDir;
    const showHidden = req.query.showHidden === 'true';

    // Security Check: Ensure the path is within the user's home directory
    if (!requestedPath.startsWith(userHomeDir)) {
        return res.status(403).send('Forbidden: Access denied.');
    }

    fs.readdir(requestedPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            return res.status(500).send('Error reading directory');
        }

        const promises = entries.map(entry => {
            return new Promise((resolve) => {
                const fullPath = path.join(requestedPath, entry.name);
                fs.stat(fullPath, (statErr, stats) => {
                    // If stat fails, it might be a broken symlink, so we treat it as a file.
                    const type = (!statErr && stats.isDirectory()) ? 'directory' : 'file';
                    resolve({ name: entry.name, type: type });
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

            const listHtml = renderFileListFragment(data);
            const oob = `<span id="file-browser-header-text" hx-swap-oob="true">~/${escapeHtml(relCurrentPath)}</span>` +
                        `<input type="hidden" id="current-path" hx-swap-oob="true" value="${escapeHtml(relCurrentPath)}">`;
            res.set('Content-Type', 'text/html').send(listHtml + oob);
        }).catch(err => {
            console.error(err);
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
        console.error('Error fetching system stats:', error);
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

const port = 3000;
app.listen(port, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();
    let ipAddress = 'localhost';
    for (let iface in interfaces) {
        for (let alias of interfaces[iface]) {
            if (alias.family === 'IPv4' && !alias.internal) {
                ipAddress = alias.address;
                break;
            }
        }
    }
    console.log(`Server listening on http://${ipAddress}:${port}`);
});
