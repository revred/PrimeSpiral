const http = require('http');
const fs = require('fs');
const path = require('path');
const { validateWebAssets } = require('../tools/validate_web_assets');

function log(msg) {
    console.log(msg);
    fs.appendFileSync('server.log', `${new Date().toISOString()} ${msg}\n`);
}

if (fs.existsSync('server.log')) fs.unlinkSync('server.log');

const port = 8081;

function enforceGuardrails() {
    const projectRoot = path.join(__dirname, '..');
    const result = validateWebAssets({ projectRoot });

    if (!result.ok) {
        console.error('[Guardrails] Web asset validation failed. Refusing to start server.');
        for (const err of result.errors) {
            console.error(`  - ${err}`);
        }
        process.exit(1);
    }

    console.log('[Guardrails] Web asset validation passed.');
}

enforceGuardrails();

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.dll': 'application/octet-stream',
    '.pdb': 'application/octet-stream',
    '.blat': 'application/octet-stream',
    '.dat': 'application/octet-stream',

};

http.createServer(function (request, response) {
    log('request ' + request.url);

    // Strip query string
    let originalUrl = request.url;
    let url = originalUrl.split('?')[0];

    // Handle /PrimeSpiral/ prefix from <base> tag
    if (url.startsWith('/PrimeSpiral/')) {
        url = url.substring(13);
    }

    // Default to index.html
    if (url === '' || url === '/') {
        url = '/index.html';
    }

    // Resolve File Path
    // Serve everything from project root so index.html (at root) can resolve ./wwwroot/... paths
    const projectRoot = path.join(__dirname, '..');
    const wwwroot = __dirname;
    let filePath = '';
    let frameworkMatched = false;

    // Framework Mapping (Dynamic Resolution for Hashed Files)
    if (url.includes('/_framework/')) {
        const parts = url.split('/_framework/');
        const fileName = parts[1];

        // Prioritize the user-requested artefacts folder
        const searchDirs = [
            path.join(wwwroot, '_framework'),
            path.join(projectRoot, 'artefacts', 'publish', 'wwwroot', '_framework'),
            path.join(projectRoot, 'artefacts', '_framework')
        ];

        let matchedFile = null;
        for (const searchDir of searchDirs) {
            if (fs.existsSync(searchDir)) {
                // If it's a direct match, use it
                const directPath = path.join(searchDir, fileName);
                if (fs.existsSync(directPath) && !fs.statSync(directPath).isDirectory()) {
                    matchedFile = directPath;
                    break;
                }

                // Otherwise, try to find a file with the same prefix (stripping hash)
                const files = fs.readdirSync(searchDir);
                const requestedPrefix = fileName.split('.')[0];
                const ext = path.extname(fileName);

                // Advanced prefix matching for dotnet.native.js etc.
                let complexPrefix = requestedPrefix;
                const nameParts = fileName.split('.');
                if (nameParts.length > 2 && (nameParts[1] === 'native' || nameParts[1] === 'runtime')) {
                    complexPrefix = nameParts[0] + '.' + nameParts[1];
                }

                const match = files.find(f => {
                    if (!f.endsWith(ext)) return false;
                    return f.startsWith(complexPrefix) || f.startsWith(requestedPrefix);
                });

                if (match) {
                    log(`[Framework Probing] Matched ${fileName} -> ${match} in ${searchDir}`);
                    matchedFile = path.join(searchDir, match);
                    break;
                }
            }
        }

        if (matchedFile) {
            filePath = matchedFile;
            frameworkMatched = true;
        } else {
            log(`[Framework Probing] FAILED to match framework file: ${fileName}`);
        }
    }

    if (!frameworkMatched) {
        filePath = path.join(projectRoot, url);

        // If it's a root request for index.html, it's already in projectRoot
        // If it's a request for a file that doesn't exist at root, try wwwroot
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            let altPath = path.join(wwwroot, url);
            if (fs.existsSync(altPath) && !fs.statSync(altPath).isDirectory()) {
                filePath = altPath;
            }
        }
    }

    log(`Mapping: ${originalUrl} -> ${filePath}`);

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function (error, content) {
        if (error) {
            log(`Read error [${error.code}]: ${filePath}`);
            if (error.code == 'ENOENT') {
                response.writeHead(404, { 'Content-Type': 'text/html' });
                response.end('404 Not Found', 'utf-8');
            }
            else {
                response.writeHead(500);
                response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        }
        else {
            response.writeHead(200, { 'Content-Type': contentType });
            response.end(content);
        }
    });

}).listen(port);
console.log(`Server running at http://127.0.0.1:${port}/`);
