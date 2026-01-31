const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../');
const indexHtmlPath = path.join(projectRoot, 'index.html');

console.log(`Checking ${indexHtmlPath}...`);

try {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const scriptRegex = /<script\s+src=["']([^"']+)["']/g;
    let match;
    const scripts = new Set();
    const errors = [];

    while ((match = scriptRegex.exec(html)) !== null) {
        const src = match[1].split('?')[0]; // Ignore query params

        // Check 1: Duplicates
        if (scripts.has(src)) {
            errors.push(`DUPLICATE SCRIPT FOUND: ${src}`);
        }
        scripts.add(src);

        // Check 2: Existence
        const localPath = path.join(projectRoot, src.replace(/\//g, path.sep));
        if (!fs.existsSync(localPath)) {
            errors.push(`MISSING FILE: ${src} (checked: ${localPath})`);
        }
    }

    if (errors.length > 0) {
        console.error("❌ VALITATION FAILED:");
        errors.forEach(e => console.error("  - " + e));
        process.exit(1);
    } else {
        console.log("✅ index.html passed static checks.");
    }

} catch (e) {
    console.error("Failed to read file:", e);
}
