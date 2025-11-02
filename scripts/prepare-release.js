const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function prepareRelease() {
    const rootDir = path.join(__dirname, '..');
    const distDir = path.join(rootDir, 'dist');
    const version = require('../package.json').version;
    const zipName = `tikim-v${version}.zip`;
    const zipPath = path.join(rootDir, zipName);

    console.log('Preparing release package...');
    
    // Check if dist exists
    try {
        await fs.access(distDir);
    } catch (err) {
        console.error('dist directory not found. Please run pnpm run build:dist first.');
        process.exit(1);
    }

    // Remove old zip if exists
    try {
        await fs.unlink(zipPath);
        console.log('Removed existing zip file');
    } catch (err) {
        // Ignore if file doesn't exist
    }

    // Create zip file using PowerShell
    console.log(`Source directory: ${distDir}`);
    console.log(`Target zip file: ${zipPath}`);

    // Ensure the directory exists
    if (!fsSync.existsSync(distDir)) {
        console.error(`Error: Distribution directory not found at: ${distDir}`);
        process.exit(1);
    }

    // Try to find 7-Zip first
    const sevenZipPath = 'C:\\Program Files\\7-Zip\\7z.exe';
    
    try {
        if (fsSync.existsSync(sevenZipPath)) {
            console.log('Using 7-Zip to create archive...');
            execSync(`"${sevenZipPath}" a -tzip "${zipPath}" "${distDir}\\*"`, { stdio: 'inherit' });
        } else {
            // Fallback to PowerShell
            console.log('7-Zip not found, using PowerShell to create archive...');
            const powershellCommand = `
                Write-Host "Creating zip file from '${distDir}' to '${zipPath}'"
                cd "${distDir}"
                Compress-Archive -Path * -DestinationPath "${zipPath}" -Force
                if ($?) {
                    Write-Host "Zip file created successfully at: $('${zipPath}')"
                    Get-Item "${zipPath}"
                } else {
                    Write-Host "Failed to create zip file"
                    exit 1
                }
            `;
            execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'inherit' });
        }
        
        // Verify the zip was created
        if (fsSync.existsSync(zipPath)) {
            const stats = fsSync.statSync(zipPath);
            console.log(`Successfully created ${zipPath} (${Math.round(stats.size / 1024 / 1024)} MB)`);
        } else {
            throw new Error('Zip file was not created');
        }
    } catch (error) {
        console.error('Failed to create zip file:', error.message);
        process.exit(1);
    }

    console.log('Creating zip file...');
    execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'inherit' });

    console.log(`
Release package created successfully!
File: ${zipName}

To create a GitHub release:
1. Go to https://github.com/zoharch/Tikim/releases
2. Click "Create a new release"
3. Tag version: v${version}
4. Title: Tikim v${version}
5. Upload the ${zipName} file
6. Add release notes
7. Click "Publish release"

The zip file includes:
- tikim.exe (Main executable)
- .local-browsers/ (Playwright browsers)
- example.xlsx (Sample input file)
- Required directories (input, output, temp, logs)
- run_tikim.bat (Launch script)
    `);
}

prepareRelease().catch(console.error);