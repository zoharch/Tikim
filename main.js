// main.js - Parallel insolvency checker using worker threads
const {Worker, isMainThread, parentPort, workerData} = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

// Ensure logs directory is created only once
let logDirInitialized = false;
const logDirPath = path.join(__dirname, 'logs');

async function ensureLogDir() {
  if (!logDirInitialized) {
    try {
      await fs.mkdir(logDirPath, {recursive: true});
      logDirInitialized = true;
    } catch (err) {
      // If directory exists, ignore error
      if (err.code !== 'EEXIST') {
        console.error(`Failed to create log directory: ${err.message}`);
      } else {
        logDirInitialized = true;
      }
    }
  }
}

// Create logger function that writes to both console and file
async function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
  console.log(logMessage);

  try {
    await ensureLogDir();
    const logFile = path.join(logDirPath, `tikim-${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logFile, logMessage + '\n');
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

async function logError(error, context = '') {
  const errorMessage = `${context}\nError: ${error.message}\nStack: ${error.stack}`;
  await log(errorMessage, 'error');
}

async function formatDate(d) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear().toString().slice(-2)} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}
// Use literal module paths so pkg can include them at build time
const NUM_WORKERS = Math.max(2, os.cpus().length - 1);

async function runParallel() {
  try {
    const startTime = new Date();
    await log(`Parallel run started - ${await formatDate(startTime)}`);

    // Determine headless mode from environment or CLI
    const headlessFlag = process.env.PLAYWRIGHT_HEADLESS === '1' || process.argv.includes('--headless');
    await log(`Headless mode: ${headlessFlag}`);

    // Resolve input directory from multiple possible locations to work with packaged exe
    async function resolveInputDir() {
      const candidates = [
        path.join(process.cwd(), 'input'), // when run from project root or batch changed cwd
        path.join(path.dirname(process.execPath), 'input'), // next to the executable
        path.join(path.dirname(process.execPath), '..', 'input'), // parent of exe (when dist folder used)
        path.join(__dirname, 'input'), // inside snapshot (only if included as asset)
      ];
      for (const d of candidates) {
        try {
          const st = await fs.stat(d);
          if (st && st.isDirectory()) {
            await log(`Using input directory: ${d}`);
            return d;
          }
        } catch (e) {
          // ignore and try next
        }
      }
      return null;
    }

    // Helper to resolve and ensure a directory exists
    async function ensureDir(name, defaultParent) {
      const candidates = [
        path.join(process.cwd(), name), // current working directory
        path.join(path.dirname(process.execPath), name), // next to exe
        path.join(path.dirname(process.execPath), '..', name), // parent of exe
        path.join(defaultParent, name), // fallback (for dev/source tree)
      ];

      // First try to find existing directory
      for (const d of candidates) {
        try {
          const st = await fs.stat(d);
          if (st && st.isDirectory()) {
            await log(`Using existing ${name} directory: ${d}`);
            return d;
          }
        } catch (e) {
          // ignore and try next
        }
      }

      // If none exist, create in first writable location
      for (const d of candidates) {
        try {
          await fs.mkdir(d, {recursive: true});
          await log(`Created ${name} directory: ${d}`);
          return d;
        } catch (e) {
          // ignore and try next
        }
      }

      throw new Error(`Could not find or create ${name} directory in any of:\n${candidates.join('\n')}`);
    }

    const inputDir = await resolveInputDir();
    if (!inputDir) {
      await log('No input directory found. Checked common locations (cwd, exe dir, exe parent, snapshot).', 'error');
      await log(
        'Please either: 1) place an `input` folder next to the executable (or where you run the batch), or 2) add `input/**` to `pkg.assets` in package.json and rebuild with pnpm run build:dist.',
        'error'
      );
      process.exit(1);
    }

    const files = await fs.readdir(inputDir);
    const excelFiles = files.filter((f) => f.endsWith('.xlsx') || f.endsWith('.xls'));

    if (excelFiles.length === 0) {
      await log('No Excel files found in the input folder', 'error');
      await log(`Expected input folder: ${inputDir}`, 'error');
      process.exit(1);
    }

    await log(`Found ${excelFiles.length} Excel files in input directory`);

    // Read input data using readFile.js logic (use literal require so pkg can include it)
    const {readLatestXLSXtoJSON} = require('./io/readFile.js');

    // Resolve output and temp directories
    const outputDir = await ensureDir('output', __dirname);
    const tempDir = await ensureDir('temp', __dirname);
    // Clean temp directory before execution
    try {
      const tempFiles = await fs.readdir(tempDir);
      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        try {
          await fs.unlink(filePath);
          await log(`Cleaned temporary file: ${filePath}`);
        } catch (err) {
          await log(`Failed to delete ${filePath}: ${err.message}`, 'error');
        }
      }
    } catch (err) {
      await log(`Failed to read temp directory: ${err.message}`, 'error');
    }
    let inputRows, extendedTitles;
    try {
      ({rows: inputRows, titles: extendedTitles} = await readLatestXLSXtoJSON(inputDir));
    } catch (err) {
      await logError(err, 'Error reading input Excel file');
      process.exit(1);
    }
    const chunkSize = Math.ceil(inputRows.length / NUM_WORKERS);
    const chunks = Array.from({length: NUM_WORKERS}, (_, i) => inputRows.slice(i * chunkSize, (i + 1) * chunkSize));
    // Only keep non-empty chunks
    const nonEmptyChunks = chunks.filter((chunk) => chunk.length > 0);
    await log(`Total input rows: ${inputRows.length}`);
    await log(`Spawning ${nonEmptyChunks.length} workers for non-empty chunks.`);
    for (const [idx, chunk] of nonEmptyChunks.entries()) {
      await log(`Worker ${idx}: assigned ${chunk.length} rows.`);
    }

    // Worker function: runs processRows from index.js on a chunk
    function runWorker(chunk, workerIdx) {
      return new Promise((resolve, reject) => {
        const outputFile = path.join(tempDir, `output_worker_${workerIdx}.json`);

        // Try various ways to resolve the worker script path
        const possiblePaths = [
          path.join(process.execPath, '..', 'snapshot', 'index.js'),
          path.join(__dirname, 'index.js'),
          path.join(process.cwd(), 'index.js'),
          './index.js',
        ];

        let workerPath = null;
        for (const p of possiblePaths) {
          try {
            require.resolve(p);
            workerPath = p;
            break;
          } catch (e) {
            continue;
          }
        }

        if (!workerPath) {
          throw new Error('Could not resolve worker script path. Tried:\n' + possiblePaths.join('\n'));
        }

        // Log the resolved path for debugging
        log(`Starting worker ${workerIdx} with script: ${workerPath}`);

        const worker = new Worker(workerPath, {
          workerData: {rows: chunk, extendedTitles, outputFile, headless: headlessFlag},
        });
        worker.on('message', resolve);
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
      });
    }

    // Run all workers in parallel
    await Promise.all(nonEmptyChunks.map((chunk, i) => runWorker(chunk, i)));
    console.log('All workers finished. Collecting results...');

    // Collect all worker JSON outputs
    let mergedResults = [];
    try {
      const workerJsonFiles = await fs.readdir(tempDir);
      for (const file of workerJsonFiles) {
        if (file.endsWith('.json')) {
          let data;
          try {
            data = await fs.readFile(path.join(tempDir, file), 'utf8');
          } catch (e) {
            await log(`Failed to read ${file}: ${e.message}`, 'error');
            continue;
          }
          try {
            const arr = JSON.parse(data);
            if (Array.isArray(arr)) mergedResults = mergedResults.concat(arr);
          } catch (e) {
            await log(`Failed to parse ${file}: ${e.message}`, 'error');
          }
        }
      }
    } catch (err) {
      await logError(err, 'Error collecting worker outputs');
      process.exit(1);
    }

    // Generate timestamp as in index.js
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const ts = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear().toString().slice(-2)}-${pad(now.getHours())}-${pad(
      now.getMinutes()
    )}`;
    const jsonFile = path.join(outputDir, `results-${ts}.json`);
    const xlsxFile = path.join(outputDir, `results-${ts}.xlsx`);

    // Re-apply cell_1 mapping and cleanup logic as in index.js
    // Preserve all original input fields from inputRows in mergedResults
    const inputFieldNames = Object.keys(inputRows[0] || {});
    mergedResults = mergedResults.map((r) => {
      let updated = {...r};
      // Add missing input fields from inputRows if not present
      inputFieldNames.forEach((field) => {
        if (!(field in updated) && field !== 'cell_1') {
          updated[field] = '';
        }
      });
      if ((updated.individualDebtor === undefined || updated.individualDebtor === '') && updated.cell_1) {
        updated.individualDebtor = updated.cell_1.replace(/^\s+|\s+$/g, '');
      }
      delete updated.cell_1;
      return updated;
    });

    // Save merged results as JSON in output folder
    try {
      await fs.writeFile(jsonFile, JSON.stringify(mergedResults, null, 2));
      await log(`Parallel results saved to ${jsonFile}`);
    } catch (err) {
      await logError(err, 'Error saving merged JSON results');
    }

    // Export merged results to XLSX in output folder using index.js logic
    try {
      const {exportToXLSX} = require('./index.js');
      await exportToXLSX(mergedResults, extendedTitles, xlsxFile);
      await log(`Parallel XLSX saved to ${xlsxFile}`);
    } catch (err) {
      await logError(err, 'Error exporting XLSX');
    }
    const endTime = new Date();
    const durationMs = endTime - startTime;
    const durationSec = Math.floor(durationMs / 1000);
    const durationMin = Math.floor(durationSec / 60);
    const durationStr = durationMin > 0 ? `${durationMin}m ${durationSec % 60}s` : `${durationSec}s`;
    const endMsg = `[${await formatDate(endTime)}] Parallel run finished`;
    const durationMsg = `Total execution time: ${durationStr}`;
    console.log(endMsg);
    console.log(durationMsg);
    await log(endMsg);
    await log(durationMsg);
    process.exit(0);
  } catch (error) {
    await logError(error, 'Error in parallel run');
    try {
      await ensureLogDir();
      const logFile = path.join(logDirPath, `tikim-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, `[${new Date().toISOString()}] ERROR: ${error && error.message ? error.message : error}\n`);
    } catch (e) {}
    process.exit(1);
  }
}

if (isMainThread) {
  runParallel().catch(async (error) => {
    await logError(error, 'Fatal error in main thread');
    process.exit(1);
  });
}
