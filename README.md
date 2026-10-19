# HTML Terminal Emulator

A simple, web-based terminal emulator that provides a real-time interface to a `fish` shell running on a `Node.js` backend. It also includes a file browser and a code editor with syntax highlighting.

This application uses `xterm.js` for the frontend terminal rendering and `node-pty` on the backend to spawn and communicate with a native shell process. The code editor is powered by Monaco Editor, the same editor that powers VS Code.

## Features

- A fully functional terminal rendered in a web browser.
- Uses the `fish` shell by default.
- Real-time, low-latency communication using WebSockets.
- A file browser to navigate the file system, with features like create, rename, delete, upload, and download.
- A code editor with syntax highlighting for many languages.
- Accessible locally or from other devices on the same local network.

## Tech Stack

- **Backend:** Node.js, Express, `express-ws`, `node-pty`
- **Frontend:** HTML, CSS, JavaScript, `xterm.js`, Monaco Editor

## System-Level Dependencies

Before installing the Node.js packages, ensure your system has the required build tools. The `node-pty` package, which is crucial for the terminal functionality, needs to be compiled from source during installation.

**Required tools:**

- A C++ compiler (like `g++`)
- `make`
- `python` (v3.x)

**Installation on Debian/Ubuntu:**

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

**Installation on CentOS/RHEL:**

```bash
sudo yum groupinstall -y 'Development Tools'
sudo yum install -y python3
```

**Installation on Arch Linux:**

```bash
sudo pacman -S --needed base-devel python
```

**For `micromamba` / `conda` users (on HPC or without root access):**

If you are using `micromamba` or `conda`, you can create an environment with all the necessary dependencies using the following command. This is the recommended method for HPC environments where you don't have root access.

```bash
micromamba create -n node-env -c conda-forge nodejs fish compilers make python
micromamba activate node-env
```

After activating the environment, you can proceed to install the npm packages.

## Setup and Installation

1. **Prerequisites:**
   
   - [Node.js](https://nodejs.org/) installed.
   - The `fish` shell installed on the server machine.
   - System-level build tools (see above).

2. **Install Dependencies:**
   Clone the repository (or ensure all files are present) and run the following command in the project root to install the necessary packages:
   
   ```bash
   npm install
   or
   npm rebuild
   ```

## Dependencies

This project relies on the following packages, which are automatically installed when you run `npm install`:

### Backend (Node.js)

- **`express`**: A minimal and flexible Node.js web application framework.
- **`express-ws`**: Adds WebSocket endpoints to your Express application.
- **`express-basic-auth`**: A simple middleware for adding basic HTTP authentication.
- **`node-pty`**: A library for spawning and communicating with pseudoterminals (PTYs).
- **`archiver`**: A library for creating archive files (e.g., `.zip`).
- **`multer`**: A middleware for handling `multipart/form-data`, used for file uploads.

### Frontend

- **`xterm`**: A powerful, fast, and fully-featured terminal emulator for the web.
- **`xterm-addon-fit`**: An addon for `xterm.js` that enables the terminal to resize itself to fit its container.
- **Monaco Editor**: The code editor that powers VS Code, used for the in-browser editor. It is loaded from a CDN.

## Usage

1. **Start the Server:**
   Run the following command to start the backend server:
   
   ```bash
   AUTH_USER=<user> AUTH_PASS=<password> node server.js
   ```
   
   The server will start on port 3000 (override with `PORT`).

2. **Local Access:**
   Open your web browser and navigate to:
   
   ```
   http://localhost:3000
   ```

3. **Remote Access:**
   You can access the terminal from any other device on the same network.
   
   - First, find the local IP address of the machine running the server. On Linux/macOS, you can use:
     
     ```bash
     ip addr show | grep "inet "
     ```
   
   - Then, on the remote device, navigate to `http://<YOUR_LOCAL_IP>:3000` (e.g., `http://192.168.1.113:3000`).
   
   - If the firewall block access from other machine, run
     
     ```bash
     sudo ufw allow 3000/tcp
     ```

## Authentication

The application uses HTTP Basic Authentication. Credentials come from the `AUTH_USER` and `AUTH_PASS` environment variables; the server refuses to start if either is unset. See `.env.example` for these and the other optional settings (`PORT`, `TLS_CERT_PATH`/`TLS_KEY_PATH`, `LOG_LEVEL`, upload limits).

The server does **not** rate-limit requests, so nothing slows down password guessing. Use a strong password, and if the server is reachable beyond a trusted network, put a reverse proxy with rate limiting (or `fail2ban`) in front of it.

## Configuration

### Fish Greeting

On the first run, the application will create a file at `~/.config/fish/config.fish` to disable the default greeting message of the `fish` shell. This is done to provide a cleaner terminal experience.

## Running in the Background (Persistence)

To keep the server running even after you close your terminal, you can use a process manager or the `nohup` command.

### Recommended Method: `pm2`

`pm2` is a powerful process manager for Node.js applications. It keeps your app alive, manages logs, and simplifies common admin tasks.

1. **Install `pm2` globally (one-time setup):**
   
   ```bash
   npm install pm2 -g
   ```

2. **Start the server with `pm2`:**
   
   ```bash
   AUTH_USER=<user> AUTH_PASS=<password> pm2 start server.js
   ```
   
   `pm2` saves these variables when the process starts, so `pm2 restart server` keeps using them. After changing them, run `pm2 restart server --update-env`.

3. **Manage the application:**
   
   - `pm2 list`: List all running processes.
   - `pm2 stop server`: Stop the server.
   - `pm2 restart server`: Restart the server.
   - `pm2 logs server`: View server logs.

### Alternative Method: `nohup`

`nohup` is a standard Linux command that allows a process to keep running after the user has logged out.

1. **Start the server:**
   
   ```bash
   AUTH_USER=<user> AUTH_PASS=<password> nohup node server.js &
   ```
   
   Output will be redirected to a `nohup.out` file in the project directory.

2. **Stop the server:**
   You must find and kill the process manually.
   
   ```bash
   # Find the Process ID (PID)
   ps aux | grep "node server.js"
   
   # Use the PID to kill the process
   kill <PID>
   ```

## Security Warning

The application is configured to be accessible from any device on your local network. Do not expose this server directly to the public internet, as it could grant unauthorized access to your system. There is no built-in rate limiting (see [Authentication](#authentication)).
