const fs = require("fs");
const path = require("path");

function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function dirExists(dirPath) {
    try {
        return fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

function toPosix(value) {
    return value.replace(/\\/g, "/");
}

function rel(rootDir, targetPath) {
    return toPosix(path.relative(rootDir, targetPath));
}

function collectPackageReferences(csprojPath) {
    const refs = new Set();
    if (!fileExists(csprojPath)) {
        return refs;
    }

    const text = fs.readFileSync(csprojPath, "utf8");
    const re = /<PackageReference\s+Include="([^"]+)"/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        refs.add(match[1]);
    }
    return refs;
}

function validateIndexFile(indexPath, rootDir, errors) {
    if (!fileExists(indexPath)) {
        errors.push(`Missing HTML entry file: ${rel(rootDir, indexPath)}`);
        return;
    }

    const html = fs.readFileSync(indexPath, "utf8");
    const normalized = html.replace(/\s+/g, " ");
    if (
        normalized.includes("blazor.webassembly#[.{fingerprint}].js") ||
        normalized.includes("{fingerprint}")
    ) {
        errors.push(
            `Unresolved fingerprint placeholder found in ${rel(rootDir, indexPath)}`
        );
    }

    const scriptRe = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    const seen = new Set();
    let match;

    while ((match = scriptRe.exec(html)) !== null) {
        const rawSrc = match[1].trim();
        if (!rawSrc) {
            continue;
        }
        if (/^(https?:)?\/\//i.test(rawSrc) || rawSrc.startsWith("data:")) {
            continue;
        }

        const srcNoQuery = rawSrc.split("?")[0];
        const srcNoHash = srcNoQuery.split("#")[0];
        if (!srcNoHash) {
            continue;
        }

        if (seen.has(srcNoHash)) {
            errors.push(
                `Duplicate script source "${srcNoHash}" in ${rel(rootDir, indexPath)}`
            );
        }
        seen.add(srcNoHash);

        if (
            srcNoHash.startsWith("_framework/") ||
            srcNoHash.startsWith("/_framework/")
        ) {
            continue;
        }

        const fromIndex = path.resolve(path.dirname(indexPath), srcNoHash);
        const fromRoot = path.resolve(rootDir, srcNoHash.replace(/^\//, ""));
        if (!fileExists(fromIndex) && !fileExists(fromRoot)) {
            errors.push(
                `Missing script target "${srcNoHash}" referenced by ${rel(
                    rootDir,
                    indexPath
                )}`
            );
        }
    }
}

function hasFrameworkAsset(files, prefix, suffix = ".wasm") {
    return files.some((file) => file.startsWith(prefix) && file.endsWith(suffix));
}

function validateFrameworkAssets(rootDir, packageRefs, errors) {
    const frameworkDir = path.join(rootDir, "wwwroot", "_framework");
    if (!dirExists(frameworkDir)) {
        errors.push("Missing runtime directory: wwwroot/_framework");
        return;
    }

    const files = fs.readdirSync(frameworkDir);
    const mustExist = [
        "blazor.webassembly.js",
        "dotnet.js",
    ];

    for (const fileName of mustExist) {
        if (!fileExists(path.join(frameworkDir, fileName))) {
            errors.push(`Missing runtime file: wwwroot/_framework/${fileName}`);
        }
    }

    if (!hasFrameworkAsset(files, "Sharp.Primer.")) {
        errors.push("Missing Sharp.Primer wasm payload in wwwroot/_framework");
    }

    if (!hasFrameworkAsset(files, "Sharc.Core.")) {
        errors.push("Missing Sharc.Core wasm payload in wwwroot/_framework");
    }

    if (packageRefs.has("Sharc") && !hasFrameworkAsset(files, "Sharc.")) {
        errors.push(
            "Sharc package is referenced but Sharc.*.wasm is missing in wwwroot/_framework"
        );
    }

    if (packageRefs.has("Sharc.Graph") && !hasFrameworkAsset(files, "Sharc.Graph.")) {
        errors.push(
            "Sharc.Graph package is referenced but Sharc.Graph.*.wasm is missing in wwwroot/_framework"
        );
    }

    if (
        packageRefs.has("Sharc.Vector") &&
        !hasFrameworkAsset(files, "Sharc.Vector.")
    ) {
        errors.push(
            "Sharc.Vector package is referenced but Sharc.Vector.*.wasm is missing in wwwroot/_framework"
        );
    }
}

function validateWebAssets(options = {}) {
    const rootDir = options.projectRoot
        ? path.resolve(options.projectRoot)
        : path.resolve(__dirname, "..");
    const errors = [];
    const warnings = [];

    const primerCsproj = path.join(rootDir, "Sharp.Primer", "Sharp.Primer.csproj");
    const packageRefs = collectPackageReferences(primerCsproj);

    const indexFiles = [
        path.join(rootDir, "index.html"),
        path.join(rootDir, "wwwroot", "index.html"),
        path.join(rootDir, "Sharp.Primer", "wwwroot", "index.html"),
    ];

    for (const indexFile of indexFiles) {
        validateIndexFile(indexFile, rootDir, errors);
    }

    validateFrameworkAssets(rootDir, packageRefs, errors);

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        projectRoot: rootDir,
    };
}

function printValidationResult(result) {
    const header = result.ok
        ? "Web asset validation passed."
        : "Web asset validation failed.";
    const stream = result.ok ? console.log : console.error;
    stream(header);

    if (result.errors.length > 0) {
        console.error("Errors:");
        for (const err of result.errors) {
            console.error(`  - ${err}`);
        }
    }

    if (result.warnings.length > 0) {
        console.warn("Warnings:");
        for (const warning of result.warnings) {
            console.warn(`  - ${warning}`);
        }
    }
}

if (require.main === module) {
    const result = validateWebAssets();
    printValidationResult(result);
    process.exit(result.ok ? 0 : 1);
}

module.exports = {
    validateWebAssets,
    printValidationResult,
};
