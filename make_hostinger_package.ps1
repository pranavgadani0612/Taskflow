$ErrorActionPreference = "Stop"
$staging = "d:\Documents\Desktop\Taskflow\staging_hostinger_package"
$sourceBackend = "d:\Documents\Desktop\Taskflow\task-flow-backend-main"
$sourceFrontend = "d:\Documents\Desktop\Taskflow\task-flow-frontend-main"
$destinationZip = "d:\Documents\Desktop\Taskflow\Hostinger_Full_Deployment_Package.zip"

Write-Host "0. Building Frontend with npm run build..."
Push-Location $sourceFrontend
try {
    npm run build
} finally {
    Pop-Location
}

Write-Host "1. Cleaning staging directory..."
if (Test-Path $staging) {
    Remove-Item -Recurse -Force $staging
}
New-Item -ItemType Directory -Path $staging | Out-Null
New-Item -ItemType Directory -Path "$staging\backend" | Out-Null
New-Item -ItemType Directory -Path "$staging\public" | Out-Null
New-Item -ItemType Directory -Path "$staging\uploads" | Out-Null

Write-Host "2. Copying root files..."
$rootFiles = @("server.js", "app.js", "index.js", "package.json", "package-lock.json", "web.config", ".env.example")
foreach ($f in $rootFiles) {
    $src = "$sourceBackend\$f"
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination "$staging\$f" -Force
    }
}

if (Test-Path "d:\Documents\Desktop\Taskflow\taskflow_database.sql") {
    Copy-Item -Path "d:\Documents\Desktop\Taskflow\taskflow_database.sql" -Destination "$staging\taskflow_database.sql" -Force
}

if (Test-Path "d:\Documents\Desktop\Taskflow\TaskFlow_Executive_Workflow_Guide.pdf") {
    Copy-Item -Path "d:\Documents\Desktop\Taskflow\TaskFlow_Executive_Workflow_Guide.pdf" -Destination "$staging\TaskFlow_Executive_Workflow_Guide.pdf" -Force
}

Write-Host "3. Copying backend folder (excluding node_modules)..."
Get-ChildItem -Path "$sourceBackend\backend" | Where-Object { $_.Name -ne "node_modules" -and $_.Name -ne ".env" } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination "$staging\backend" -Recurse -Force
}

Write-Host "4. Updating and Copying latest Frontend dist to public..."
if (Test-Path "$sourceFrontend\dist") {
    Copy-Item -Path "$sourceFrontend\dist\*" -Destination "$sourceBackend\public" -Recurse -Force
    Copy-Item -Path "$sourceFrontend\dist\*" -Destination "$staging\public" -Recurse -Force
} elseif (Test-Path "$sourceBackend\public") {
    Copy-Item -Path "$sourceBackend\public\*" -Destination "$staging\public" -Recurse -Force
}

Write-Host "5. Setting up uploads folder..."
New-Item -ItemType File -Path "$staging\uploads\.gitkeep" -Force | Out-Null

Write-Host "6. Creating Hostinger production .env..."
$envContent = @"
TZ=Asia/Kolkata
APP_URL=https://aliceblue-wasp-870365.hostingersite.com

# Hostinger MySQL Database Configuration
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=u783742493_taskflow_user
DB_PASSWORD="Task@#123"
DB_NAME=u783742493_taskflow_db

# Security
JWT_SECRET=super_secret_jwt_key_taskflow_2026
SUPERADMIN_EMAIL=gadanipranav@gmail.com

# SMTP Email Configuration (Gmail App Password)
EMAIL_USER=padhyainternal@gmail.com
EMAIL_PASS=dgyjramnepevvxwv
"@

Set-Content -Path "$staging\.env" -Value $envContent -Encoding UTF8
Set-Content -Path "$staging\backend\.env" -Value $envContent -Encoding UTF8

Write-Host "7. Compressing to $destinationZip..."
if (Test-Path $destinationZip) {
    Remove-Item -Force $destinationZip
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $destinationZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host "8. Cleaning up staging directory..."
Remove-Item -Recurse -Force $staging

$zipItem = Get-Item $destinationZip
Write-Host "SUCCESS! Created $destinationZip ($([math]::Round($zipItem.Length / 1MB, 2)) MB)"
