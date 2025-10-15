const { getLatestXLSXFile, readLatestXLSXtoJSON } = require('./readFile');
const path = require('path');

async function testReadLatestXlsxToJson() {
    const inputDir = path.join(__dirname, '../input');
    const latestFile = await getLatestXLSXFile(inputDir);
    if (!latestFile) {
        console.error('No XLSX file found in input folder.');
        process.exit(1);
    }
    console.log('Latest XLSX file:', latestFile);
    const { rows, titles } = await readLatestXLSXtoJSON(inputDir);
    console.log('Rows:', JSON.stringify(rows, null, 2));
    console.log('Titles:', JSON.stringify(titles, null, 2));
    if (!Array.isArray(rows)) {
        throw new Error('Rows is not an array');
    }
    if (rows.length === 0) {
        throw new Error('Rows array is empty');
    }
    for (const row of rows) {
        if (typeof row !== 'object') throw new Error('Row is not an object');
        if (!('caseID' in row)) throw new Error('Row missing caseID');
        if (!('caseName' in row)) throw new Error('Row missing caseName');
        if (!('personalID' in row)) throw new Error('Row missing personalID');
    }
    if (typeof titles !== 'object' || Array.isArray(titles)) {
        throw new Error('Titles is not an object');
    }
    if (titles.caseID !== 'מספר תיק') throw new Error('Titles.caseID is not "מספר תיק"');
    if (titles.caseName !== 'שם תיק') throw new Error('Titles.caseName is not "שם תיק"');
    if (titles.personalID !== 'מספר מזהה') throw new Error('Titles.personalID is not "מספר מזהה"');
    console.log('Test passed: XLSX file converted to expected JSON format and titles are correct.');
}

testReadLatestXlsxToJson();