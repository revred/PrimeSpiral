const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8081;

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
    console.log('request ', request.url);

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

    // Framework Mapping (Dynamic Resolution for Hashed Files)
    if (url.includes('/_framework/')) {
        const parts = url.split('/_framework/');
        const fileName = parts[1];
        const searchDir = path.join(__dirname, '_framework');

        if (fs.existsSync(searchDir)) {
            const files = fs.readdirSync(searchDir);
            // Match name.hash.ext or name.ext
            const baseName = fileName.split('.')[0];
            const ext = path.extname(fileName);
            const match = files.find(f => f.startsWith(baseName) && f.endsWith(ext));

            if (match) {
                console.log(`[Framework Probing] Found ${fileName} -> ${match}`);
                url = '/_framework/' + match;
            } else {
                console.warn(`[Framework Probing] No match for ${fileName} in ${searchDir}`);
            }
        }
    }

    // Resolve File Path
    // Serve everything from project root so index.html (at root) can resolve ./wwwroot/... paths
    const projectRoot = path.join(__dirname, '..');
    const wwwroot = __dirname;

    let filePath = path.join(projectRoot, url);

    // If it's a root request for index.html, it's already in projectRoot
    // If it's a request for a file that doesn't exist at root, try wwwroot
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        let altPath = path.join(wwwroot, url);
        if (fs.existsSync(altPath) && !fs.statSync(altPath).isDirectory()) {
            filePath = altPath;
        }
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // Try inside wwwroot
        let altPath = path.join(wwwroot, url);
        if (fs.existsSync(altPath) && !fs.statSync(altPath).isDirectory()) {
            filePath = altPath;
        }
    }

    console.log(`Mapping: ${originalUrl} -> ${filePath}`);

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function (error, content) {
        if (error) {
            console.error(`Read error [${error.code}]: ${filePath}`);
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
            response.end(content, 'utf-8');
        }
    });

}).listen(port);
console.log(`Server running at http://127.0.0.1:${port}/`);
