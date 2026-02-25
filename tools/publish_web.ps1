param(
    [string]$Configuration = "Release",
    [string]$Project = "Sharp.Primer/Sharp.Primer.csproj",
    [string]$OutputDir = "artefacts/publish"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectPath = Join-Path $projectRoot $Project
$publishDir = Join-Path $projectRoot $OutputDir
$publishWwwroot = Join-Path $publishDir "wwwroot"
$targetWwwroot = Join-Path $projectRoot "wwwroot"
$validatorScript = Join-Path $projectRoot "tools/validate_web_assets.js"

if (-not (Test-Path $projectPath)) {
    throw "Project file not found: $projectPath"
}

Write-Host "Publishing $Project ($Configuration) ..."
& dotnet publish $projectPath -c $Configuration -o $publishDir
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $publishWwwroot)) {
    throw "Published wwwroot directory was not produced: $publishWwwroot"
}

$requiredDirs = @("_framework")
$optionalDirs = @("_content")

foreach ($dir in $requiredDirs) {
    $srcDir = Join-Path $publishWwwroot $dir
    $dstDir = Join-Path $targetWwwroot $dir

    if (-not (Test-Path $srcDir)) {
        throw "Missing published directory: $srcDir"
    }

    if (Test-Path $dstDir) {
        Remove-Item $dstDir -Recurse -Force
    }
    Copy-Item $srcDir $dstDir -Recurse -Force
    Write-Host "Synced directory: wwwroot/$dir"
}

foreach ($dir in $optionalDirs) {
    $srcDir = Join-Path $publishWwwroot $dir
    $dstDir = Join-Path $targetWwwroot $dir

    if (-not (Test-Path $srcDir)) {
        Write-Host "Skipping optional directory (not present): wwwroot/$dir"
        continue
    }

    if (Test-Path $dstDir) {
        Remove-Item $dstDir -Recurse -Force
    }
    Copy-Item $srcDir $dstDir -Recurse -Force
    Write-Host "Synced directory: wwwroot/$dir"
}

$syncFiles = @("index.html", "index.html.br", "index.html.gz")
foreach ($file in $syncFiles) {
    $srcFile = Join-Path $publishWwwroot $file
    $dstFile = Join-Path $targetWwwroot $file
    if (Test-Path $srcFile) {
        Copy-Item $srcFile $dstFile -Force
        Write-Host "Synced file: wwwroot/$file"
    }
}

$srcCssFile = Join-Path $publishWwwroot "css/app.css"
$dstCssDir = Join-Path $targetWwwroot "css"
$dstCssFile = Join-Path $dstCssDir "app.css"
if (Test-Path $srcCssFile) {
    if (-not (Test-Path $dstCssDir)) {
        New-Item -ItemType Directory -Path $dstCssDir | Out-Null
    }
    Copy-Item $srcCssFile $dstCssFile -Force
    Write-Host "Synced file: wwwroot/css/app.css"
}

Write-Host "Running web asset validation ..."
& node $validatorScript
if ($LASTEXITCODE -ne 0) {
    throw "Web asset validation failed."
}

Write-Host "Publish and sync completed successfully."
