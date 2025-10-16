// main.js - Parallel insolvency checker using worker threads
const {Worker, isMainThread, parentPort, workerData} = require('worker_threads');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const INPUT_SCRIPT = path.join(__dirname, 'io', 'readFile.js');
const INDEX_SCRIPT = path.join(__dirname, 'index.js');
const NUM_WORKERS = Math.max(2, os.cpus().length - 1);

async function runParallel() {
  function formatDate(d) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear().toString().slice(-2)} ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}:${pad(d.getSeconds())}`;
  }
  const startTime = new Date();
  console.log(`[${formatDate(startTime)}] Parallel run started`);
  // Read input data using readFile.js logic
  const {readLatestXLSXtoJSON} = require(INPUT_SCRIPT);
  const inputDir = path.join(__dirname, 'input'); // adjust as needed
  const outputDir = path.join(__dirname, 'output');
  const tempDir = path.join(__dirname, 'temp');
  await fs.mkdir(outputDir, {recursive: true});
  await fs.mkdir(tempDir, {recursive: true});
  // Clean temp directory before execution
  const tempFiles = await fs.readdir(tempDir);
  for (const file of tempFiles) {
    const filePath = path.join(tempDir, file);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      console.error(`Failed to delete ${filePath}: ${err.message}`);
    }
  }
  const {rows: inputRows, titles: extendedTitles} = await readLatestXLSXtoJSON(inputDir);
  const chunkSize = Math.ceil(inputRows.length / NUM_WORKERS);
  const chunks = Array.from({length: NUM_WORKERS}, (_, i) => inputRows.slice(i * chunkSize, (i + 1) * chunkSize));
  // Only keep non-empty chunks
  const nonEmptyChunks = chunks.filter((chunk) => chunk.length > 0);
  console.log(`Total input rows: ${inputRows.length}`);
  console.log(`Spawning ${nonEmptyChunks.length} workers for non-empty chunks.`);
  nonEmptyChunks.forEach((chunk, idx) => {
    console.log(`Worker ${idx}: assigned ${chunk.length} rows.`);
  });

  // Worker function: runs processRows from index.js on a chunk
  function runWorker(chunk, workerIdx) {
    return new Promise((resolve, reject) => {
      const outputFile = path.join(tempDir, `output_worker_${workerIdx}.json`);
      const worker = new Worker(INDEX_SCRIPT, {
        workerData: {rows: chunk, extendedTitles, outputFile, headless: true},
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
  const workerJsonFiles = await fs.readdir(tempDir);
  let mergedResults = [];
  for (const file of workerJsonFiles) {
    if (file.endsWith('.json')) {
      const data = await fs.readFile(path.join(tempDir, file), 'utf8');
      try {
        const arr = JSON.parse(data);
        if (Array.isArray(arr)) mergedResults = mergedResults.concat(arr);
      } catch (e) {
        console.error(`Failed to parse ${file}: ${e.message}`);
      }
    }
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
  await fs.writeFile(jsonFile, JSON.stringify(mergedResults, null, 2));
  console.log(`Parallel results saved to ${jsonFile}`);

  // Export merged results to XLSX in output folder using index.js logic
  const {exportToXLSX} = require(INDEX_SCRIPT);
  await exportToXLSX(mergedResults, extendedTitles, xlsxFile);
  console.log(`Parallel XLSX saved to ${xlsxFile}`);
  const endTime = new Date();
  const durationMs = endTime - startTime;
  const durationSec = Math.floor(durationMs / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationStr = durationMin > 0 ? `${durationMin}m ${durationSec % 60}s` : `${durationSec}s`;
  console.log(`[${formatDate(endTime)}] Parallel run finished`);
  console.log(`Total execution time: ${durationStr}`);
}

if (isMainThread) {
  runParallel().catch(console.error);
}
