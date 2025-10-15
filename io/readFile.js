const fs = require('fs/promises');
const path = require('path');
const xlsx = require('xlsx');

async function getLatestXLSXFile(dir) {
    const files = await fs.readdir(dir);
    // Ignore Excel temp/lock files (start with ~$)
    const xlsxFiles = files.filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
    if (xlsxFiles.length === 0) throw new Error('No XLSX files found');
    // Sort by modified time descending
    const stats = await Promise.all(
        xlsxFiles.map(f => fs.stat(path.join(dir, f)))
    );
    const sorted = xlsxFiles
        .map((f, i) => ({ file: f, mtime: stats[i].mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    return path.join(dir, sorted[0].file);
}

function cleanCell(val) {
    if (typeof val !== 'string') return val;
    // Remove null chars and excessive spaces
    return val.replace(/\u0000/g, '').replace(/\s+$/g, '').trim();
}

function mapRow(row, titles) {
    // Heuristic mapping
    const keys = ['caseID', 'caseName', 'personalID'];
    const mapped = {};
    for (let i = 0; i < keys.length; i++) {
        mapped[keys[i]] = cleanCell(row[i] || '');
    }
    // If all values are empty, fallback to original row
    if (Object.values(mapped).every(v => !v)) return row.map(cleanCell);
    return mapped;
}

async function readLatestXLSXtoJSON(inputDir) {
    const file = await getLatestXLSXFile(inputDir);
    const workbook = xlsx.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    // Map standardized keys to Hebrew column names
    const titles = {
        caseID: 'מספר תיק',
        caseName: 'שם תיק',
        personalID: 'מספר מזהה'
    };
    const dataRows = rows.slice(1); // skip header, include all data rows
    const mappedRows = dataRows.map(row => mapRow(row, Object.keys(titles)));
    return { file, rows: mappedRows, titles };
}

module.exports = { getLatestXLSXFile, readLatestXLSXtoJSON };
