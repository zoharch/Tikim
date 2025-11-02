const fs = require('fs/promises');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

async function copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await fs.copyFile(srcPath, destPath);
        }
    }
}

async function main() {
    const rootDir = path.join(__dirname, '..');
    const distDir = path.join(rootDir, 'dist');

    console.log('Creating distribution package...');

    // Create dist directory
    await fs.mkdir(distDir, { recursive: true });

    // Install Playwright browsers
    console.log('Installing Playwright browsers...');
    execSync('pnpm run install-browsers', { stdio: 'inherit' });

    // Get Playwright browser path
    const executablePath = chromium.executablePath();
    const browsersPath = path.dirname(path.dirname(path.dirname(executablePath)));
    
    // Copy Playwright browsers to dist
    console.log('Copying Playwright browsers...');
    const distBrowsersPath = path.join(distDir, '.local-browsers');
    await copyDirectory(browsersPath, distBrowsersPath);

    // Build the executable
    console.log('Building executable...');
    execSync('pnpm run build:exe', { stdio: 'inherit' });

    // Create and populate necessary directories with .gitkeep files
    const dirs = ['input', 'output', 'temp', 'logs'];
    for (const dir of dirs) {
        const dirPath = path.join(distDir, dir);
        await fs.mkdir(dirPath, { recursive: true });
        // Add .gitkeep to ensure directories are included in the package
        //await fs.writeFile(path.join(dirPath, '.gitkeep'), '');
    }

    // Copy example input file if it exists
    try {
        const exampleFile = path.join(rootDir, 'input', 'example.xlsx');
        const destFile = path.join(distDir, 'input', 'example.xlsx');
        await fs.copyFile(exampleFile, destFile);
        console.log('Copied example input file to dist/input/');
    } catch (err) {
        console.log('No example.xlsx found in input directory, skipping...');
    }

    // Read the batch script template
    const templatePath = path.join(__dirname, 'templates', 'run_tikim.bat.template');
    const batchContent = await fs.readFile(templatePath, 'utf8');
    
    await fs.writeFile(path.join(distDir, 'run_tikim.bat'), batchContent);

    // Copy README if exists
    try {
        await fs.copyFile(
            path.join(rootDir, 'README.md'),
            path.join(distDir, 'README.md')
        );
    } catch (err) {
        console.log('No README.md found, skipping...');
    }

    console.log('Distribution package created successfully!');
    console.log(`
Distribution package is ready in the 'dist' folder.
Contents:
- tikim.exe (Main executable)
- .local-browsers/ (Playwright browsers)
- input/ (Place input Excel files here)
  - example.xlsx (Sample input file showing required format)
- output/ (Results will be saved here)
- temp/ (Temporary files directory)
- logs/ (Log files directory)
- run_tikim.bat (Double-click this to run the application)

To use on another PC:
1. Copy the entire 'dist' folder to the target PC
2. Double-click run_tikim.bat to run the application
3. Place input files in the input folder (see example.xlsx for required format)
4. Results will appear in the output folder
5. Check logs folder for detailed execution logs
    `);
}

main().catch(console.error);