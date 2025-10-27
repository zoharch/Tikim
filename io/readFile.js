// Israeli ID validation
function isValidIsraeliID(id) {
  if (!/^\d{5,9}$/.test(id)) return false;
  id = id.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let num = Number(id[i]) * ((i % 2) + 1);
    if (num > 9) num -= 9;
    sum += num;
  }
  return sum % 10 === 0;
}
const fs = require('fs/promises');
const path = require('path');
const xlsx = require('xlsx');

async function getLatestXLSXFile(dir) {
  try {
    const files = await fs.readdir(dir);
    // Ignore Excel temp/lock files (start with ~$)
    const xlsxFiles = files.filter((f) => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.startsWith('~$'));
    if (xlsxFiles.length === 0) {
      console.error('\n===============================');
      console.error('          ERROR');
      console.error('===============================\n');
      console.error('No Excel files found in the input folder.');
      console.error(`\nPlease place an Excel file in:\n${dir}`);
      console.error('\nExpected file formats: .xlsx or .xls');
      console.error('\n===============================\n');
      process.exit(1);
    }
    // Sort by modified time descending
    const stats = await Promise.all(xlsxFiles.map((f) => fs.stat(path.join(dir, f))));
    const sorted = xlsxFiles.map((f, i) => ({file: f, mtime: stats[i].mtimeMs})).sort((a, b) => b.mtime - a.mtime);
    console.log(`Found input file: ${sorted[0].file}`);
    return path.join(dir, sorted[0].file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error('\nError: Input directory does not exist.');
      console.error(`Expected directory: ${dir}`);
      console.error('Please create the directory and add Excel files.\n');
      process.exit(1);
    }
    throw err;
  }
}

function cleanCell(val) {
  if (typeof val !== 'string') return val;
  // Remove null chars and excessive spaces
  return val
    .replace(/\u0000/g, '')
    .replace(/\s+$/g, '')
    .trim();
}

function mapRow(row, titles) {
  // Heuristic mapping
  const keys = ['caseID', 'caseName', 'personalID'];
  const mapped = {};
  for (let i = 0; i < keys.length; i++) {
    mapped[keys[i]] = cleanCell(row[i] || '');
  }
  // If all values are empty, fallback to original row
  if (Object.values(mapped).every((v) => !v)) return row.map(cleanCell);
  return mapped;
}

async function readLatestXLSXtoJSON(inputDir) {
  const file = await getLatestXLSXFile(inputDir);
  const workbook = xlsx.readFile(file);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, {header: 1});
  // Map standardized keys to Hebrew column names
  const titles = {
    caseID: 'מספר תיק',
    caseName: 'שם תיק',
    personalID: 'מספר מזהה',
  };
  const dataRows = rows.slice(1); // skip header, include all data rows
  const errors = [];
  const mappedRows = dataRows.map((row, idx) => {
    const mapped = mapRow(row, Object.keys(titles));
    // Clean and validate personalID
    let rawId = (mapped.personalID || '').toString();
    // Extract only digits
    let cleanedId = (rawId.match(/\d+/g) || []).join('');
    // Pad 8-digit IDs
    if (cleanedId.length === 8) {
      cleanedId = '0' + cleanedId;
    }
    mapped.personalID = cleanedId;
    // Validate
    if (!isValidIsraeliID(cleanedId)) {
      // Only log error if not a padded 8-digit ID
      if (!(rawId.length === 8 && cleanedId.length === 9)) {
        errors.push({row: idx + 2, personalID: rawId, cleanedID: cleanedId, error: 'Invalid Israeli ID'});
      }
    }
    return mapped;
  });
  if (errors.length > 0) {
    console.error('Invalid IDs found:', errors);
  }
  return {file, rows: mappedRows, titles, errors};
}

module.exports = {getLatestXLSXFile, readLatestXLSXtoJSON};
