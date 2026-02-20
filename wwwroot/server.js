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

    // Framework Mapping (for local dev dev without correct importmap resolution in some envs)
    const frameworkMap = {
        '/_framework/blazor.webassembly.js': '/wwwroot/_framework/blazor.webassembly.66stpp682q.js',
        '/_framework/dotnet.js': '/wwwroot/_framework/dotnet.w7hlke52b7.js',
        '/_framework/dotnet.native.js': '/wwwroot/_framework/dotnet.native.ifql17yk5k.js',
        '/_framework/dotnet.runtime.js': '/wwwroot/_framework/dotnet.runtime.2tx45g8lli.js',
        '/wwwroot/_framework/blazor.webassembly.js': '/wwwroot/_framework/blazor.webassembly.66stpp682q.js',
        '/wwwroot/_framework/dotnet.js': '/wwwroot/_framework/dotnet.w7hlke52b7.js',
        '/wwwroot/_framework/dotnet.native.js': '/wwwroot/_framework/dotnet.native.ifql17yk5k.js',
        '/wwwroot/_framework/dotnet.runtime.js': '/wwwroot/_framework/dotnet.runtime.2tx45g8lli.js'
    };

    if (frameworkMap[url]) {
        url = frameworkMap[url];
    }

    // Resolve File Path
    // __dirname is current dir (wwwroot)
    const projectRoot = path.join(__dirname, '..');
    const wwwroot = __dirname;

    let filePath = path.join(projectRoot, url);
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
