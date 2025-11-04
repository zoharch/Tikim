// --- WINSTON LOGGER SETUP ---
const path = require('path');
const {createLogger, format, transports} = require('winston');
const logFilePath = path.join(__dirname, 'run.log');
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({format: 'DD/MM/YY HH:mm:ss'}),
    format.printf(({timestamp, level, message}) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new transports.File({filename: logFilePath, options: {flags: 'w', encoding: 'utf8'}}), new transports.Console({})],
});
logger.info('התחלת ריצה');

// Override console.log and console.error to use winston
console.log = (...args) => {
  logger.info(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};
console.error = (...args) => {
  logger.error(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
};

// ...existing code...
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const {parentPort, workerData, isMainThread} = require('worker_threads');

if (process.platform === 'win32') {
  process.title = 'בדיקת חדלות פירעון';
  // For full effect in the console window:
  require('child_process').exec('title בדיקת חדלות פירעון');
}

// Dummy InsolvencyChecker for demonstration; replace with your real logic
const englishToHebrew = {
  personId: 'מספר מזהה',
  hasDebt: 'יש חוב ?',
  status: 'סטטוס',
  individualDebtor: 'סוג תיק',
  insolvencyCommissioner: 'רשות מטפלת',
  commissionerCaseNumber: 'מספר תיק ממונה',
  courtCaseNumber: 'מספר תיק בהמ"ש',
  enforcementCaseNumber: 'מספר תיק רשות האכיפה',
  debtorName: 'שם יחיד / תאגיד',
  debtorId: 'מזהה יחיד / תאגיד',
  district: 'מחוז',
  link: 'קישור',
  detailsLink: 'פרטים',
  kinusDate: 'תאריך צו כינוס',
  pshitaDate: 'תאריך צו פתיחת הליכים/פירוק',
  cancellationDate: 'תאריך ביטול/חיסול/עיכוב הצו',
  tikStatus: 'סטטוס התיק',
  layer: 'עו"ד מייצג',
  error: 'שגיאה',
  cell_3: 'מספר תיק ממונה',
  cell_4: 'מספר תיק בהמ"ש',
  cell_5: 'מספר תיק רשות האכיפה',
  cell_6: 'שם יחיד / תאגיד',
  cell_7: 'מזהה יחיד / תאגיד',
  cell_8: 'מחוז',
  claimant: 'נושה',
  caseID: 'מספר תיק',
  caseName: 'שם תיק',
  personalID: 'מספר מזהה',
};

// (Removed old custom logger override code; winston handles all logging)

const {chromium} = require('playwright');
class InsolvencyChecker {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.baseUrl = 'https://insolvency.justice.gov.il/poshtim/main/tikim/wfrmlisttikim.aspx';
    // Detect headless from options, workerData, environment variable, or process.argv
    if (typeof options.headless !== 'undefined') {
      this.headless = options.headless;
    } else if (typeof workerData !== 'undefined' && workerData && typeof workerData.headless !== 'undefined') {
      this.headless = workerData.headless;
    } else if (process.env.PLAYWRIGHT_HEADLESS === '1') {
      this.headless = true;
    } else {
      this.headless = process.argv.includes('--headless');
    }
  }

  async init() {
    console.log(`Initializing browser... Headless: ${this.headless}`);
    this.browser = await chromium.launch({
      headless: this.headless,
      slowMo: 1000,
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(30000);
    console.log('Navigating to insolvency site...');
    await this.page.goto(this.baseUrl);
    await this.page.waitForLoadState('networkidle');
  }

  async checkPersonId(personId) {
    try {
      console.log(`Checking person ID: ${personId}`);
      await this.page.waitForSelector('input[name="rngListTikim$txtPoshetID"]', {timeout: 10000});
      await this.page.fill('input[name="rngListTikim$txtPoshetID"]', personId);
      console.log(`Entered ID: ${personId}`);
      await this.page.click('input[id="btnSearch"]');
      console.log('Clicked search button');
      await this.page.waitForTimeout(1000);
      await this.page.waitForSelector('#lstData_GenericGridDiv', {timeout: 15000});

      // Extract table headers and values as individual props
      let detailProps = {};
      let rowDetails = await this.page.evaluate(() => {
        const table = document.querySelector('#lstData_grdDataList');
        if (table && table.rows.length > 0) {
          const firstRow = table.rows[0];
          const headers = Array.from(table.parentElement.querySelectorAll('tr')[0].cells).map((cell) => cell.innerText.trim());
          const values = Array.from(firstRow.cells).map((cell) => cell.innerText.trim());
          return {headers, values};
        }
        return {headers: [], values: []};
      });
      // Map Hebrew headers to English keys
      const hebrewToEnglish = {
        'מספר תיק': 'caseID',
        'מספר מזהה': 'personalID',
        'הממונה על חדלות פרעון': 'insolvencyCommissioner',
        'סוג תיק': 'individualDebtor',
        'רשות מטפלת': 'insolvencyCommissioner',
        'מספר תיק ממונה': 'commissionerCaseNumber',
        'מספר תיק בהמ"ש': 'courtCaseNumber',
        'מספר תיק רשות האכיפה': 'enforcementCaseNumber',
        'שם יחיד / תאגיד': 'debtorName',
        'מזהה יחיד / תאגיד': 'debtorId',
        מחוז: 'district',
        קישור: 'link',
        פרטים: 'detailsLink',
        נושה: 'claimant',
      };
      if (rowDetails.headers.length === rowDetails.values.length) {
        for (let i = 0; i < rowDetails.headers.length; i++) {
          const hebKey = rowDetails.headers[i];
          let engKey = hebrewToEnglish[hebKey];
          if (!engKey) {
            engKey = `cell_${i + 1}`;
          }
          // Special handling for individualDebtor: extract full text from span if present
          if (engKey === 'individualDebtor') {
            try {
              // Extract full text including parentheses, do not trim off brackets
              const fullText = await this.page.$eval('span[id^="bnrTikTopInfo_grdInfo_Label4_"]', (el) => el.textContent);
              // Remove only leading/trailing whitespace, not parentheses
              detailProps[engKey] = fullText.replace(/^\s+|\s+$/g, '');
            } catch (e) {
              detailProps[engKey] = rowDetails.values[i];
            }
          } else {
            detailProps[engKey] = rowDetails.values[i];
          }
        }
      }

      let pratimIndex = -1;
      let kinusDate = null;
      let pshitaDate = null;
      let cancellationDate = null;
      let tikStatus = null;
      let lawyerNames = [];

      if (rowDetails.values.length > 0) {
        for (let i = 0; i < rowDetails.headers.length; i++) {
          if (rowDetails.headers[i] === 'פרטים') {
            pratimIndex = i;
            const pratimSelector = `#lstData_grdDataList tr td:nth-child(${i + 1}) a`;
            const pratimLink = await this.page.$(pratimSelector);
            if (pratimLink) {
              await pratimLink.click();
              try {
                await this.page.waitForSelector('#lstTikGeneralDetails_txtTzavKinusDate', {timeout: 5000});
                kinusDate = await this.page.$eval('#lstTikGeneralDetails_txtTzavKinusDate', (el) => el.value);
              } catch (err) {
                console.log('Error extracting תאריך כינוס:', err.message);
              }
              try {
                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTzavPshitaDate"]', {timeout: 5000});
                pshitaDate = await this.page.$eval('[name="lstTikGeneralDetails$txtTzavPshitaDate"]', (el) => el.value);
              } catch (err) {
                console.log('Error extracting צו פתיחת הליכים/פירוק:', err.message);
              }
              try {
                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTzavCancellationDate"]', {timeout: 5000});
                cancellationDate = await this.page.$eval('[name="lstTikGeneralDetails$txtTzavCancellationDate"]', (el) => el.value);
              } catch (err) {
                console.log('Error extracting ביטול/חיסול/עיכוב הצו:', err.message);
              }
              try {
                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTikStatus"]', {timeout: 5000});
                tikStatus = await this.page.$eval('[name="lstTikGeneralDetails$txtTikStatus"]', (el) => el.value);
              } catch (err) {
                console.log('Error extracting סטטוס התיק:', err.message);
              }
              console.log(
                `Extracted kinus date: ${kinusDate}, צו פתיחת: ${pshitaDate}, ביטול/חיסול/עיכוב: ${cancellationDate}, סטטוס התיק: ${tikStatus}`
              );

              // Now click the <a> with text 'תביעות החוב' and extract lawyer names
              try {
                console.log('Waiting for table mnuTikim_lstMenu...');
                await this.page.waitForSelector('table#mnuTikim_lstMenu', {timeout: 20000});
                console.log('Found table mnuTikim_lstMenu.');
                console.log('Searching for תביעות tab in mnuTikim_lstMenu...');
                await this.page.waitForSelector('table#mnuTikim_lstMenu tr td', {timeout: 20000});
                const tdHandles = await this.page.$$('table#mnuTikim_lstMenu tr td');
                let foundTviot = false;
                for (const td of tdHandles) {
                  const text = await td.innerText();
                  if (text.includes('תביעות')) {
                    const link = await td.$('a');
                    if (link) {
                      console.log('Found תביעות tab, clicking...');
                      await link.click();
                      foundTviot = true;
                      break;
                    }
                  }
                }
                if (foundTviot) {
                  await this.page.waitForSelector('#lstData_grdDataList', {timeout: 20000});
                  await this.page.waitForTimeout(2000);
                  console.log('Extracting lawyer names from lstData_grdDataList...');
                  const lawyerData = await this.page.evaluate(() => {
                    const table = document.getElementById('lstData_grdDataList');
                    if (!table) return null;
                    const rows = Array.from(table.querySelectorAll('tr'));
                    let claimants = [];
                    let foundLawyer = false;
                    for (const tr of rows) {
                      const tds = tr.querySelectorAll('td');
                      if (tds.length > 2) {
                        const lawyerName = tds[1].innerText.trim();
                        if (lawyerName === 'אריה חגי') {
                          foundLawyer = true;
                          const claimant = tds[0].innerText.trim();
                          claimants.push(claimant);
                        }
                      }
                    }
                    if (foundLawyer) {
                      return {lawyerName: 'אריה חגי', claimants};
                    }
                    return null;
                  });
                  if (lawyerData) {
                    lawyerNames = [lawyerData.lawyerName];
                    detailProps.claimant = lawyerData.claimants.join(' | ');
                  } else {
                    lawyerNames = [];
                  }
                  if (lawyerData) {
                    console.log(`Done extracting Arie Hagay, claimants: ${detailProps.claimant || ''}`);
                  } else {
                    console.log('Done extracting Arie Hagay, not found.');
                  }
                } else {
                  console.log('No תביעות tab found in menu.');
                }
              } catch (err) {
                console.log('Error extracting lawyer names:', err.message);
              }
            }
            break;
          }
        }
      }

      const hasDebt = Object.keys(detailProps).length > 0 && Object.values(detailProps)[0] !== '';
      return {
        personId: personId,
        hasDebt: hasDebt,
        status: hasDebt ? 'DEBT_FOUND' : 'NO_DEBT',
        ...detailProps,
        kinusDate: kinusDate || null,
        pshitaDate: pshitaDate || null,
        cancellationDate: cancellationDate || null,
        tikStatus: tikStatus || null,
        layer: lawyerNames.length > 0 ? lawyerNames[0] : '',
        claimant: detailProps.claimant || '',
      };
    } catch (error) {
      console.error(`Error checking person ID ${personId}:`, error.message);
      return {
        personId: personId,
        hasDebt: null,
        status: 'ERROR',
        error: error.message,
      };
    }
  }

  async process(rows) {
    if (!this.browser || !this.page) {
      await this.init();
    }
    const results = [];
    for (let i = 0; i < rows.length; i++) {
      let personId = rows[i].personId || rows[i]['מספר מזהה'] || rows[i].personalID || '';
      if (!personId) continue;
      console.log(`\nProcessing ${i + 1}/${rows.length}: ${personId}`);
      await this.page.goto(this.baseUrl);
      await this.page.waitForLoadState('networkidle');
      const result = await this.checkPersonId(personId);
      results.push(result);
      if (i < rows.length - 1) {
        console.log('Waiting before next request...');
        await this.page.waitForTimeout(2000);
      }
    }
    return results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('Browser closed');
    }
  }
}

// XLSX export function
async function exportToXLSX(results, extendedTitles, outputFile) {
  // (Removed duplicate/unreachable code after try/catch block)
  try {
    // Map all keys to their Hebrew titles, skip personId
    const titleToKeys = {};
    for (const key of Object.keys(extendedTitles)) {
      if (key === 'personId') continue;
      const title = extendedTitles[key];
      if (!titleToKeys[title]) titleToKeys[title] = [];
      titleToKeys[title].push(key);
    }
    // Also add keys from results that aren't in extendedTitles, skip personId
    for (const row of results) {
      for (const key of Object.keys(row)) {
        if (key === 'personId') continue;
        const title = extendedTitles[key] || key;
        if (!titleToKeys[title]) titleToKeys[title] = [];
        if (!titleToKeys[title].includes(key)) titleToKeys[title].push(key);
      }
    }
    // Final ordered list of titles, excluding 'קישור' and 'פרטים', and reordering last columns
    let orderedTitles = Object.keys(titleToKeys).filter((title) => title !== 'קישור' && title !== 'פרטים');
    // Ensure the first columns are מספר תיק, שם תיק, מספר מזהה (in that order)
    const hebrewFirst = ['מספר תיק', 'שם תיק', 'מספר מזהה'];
    // Remove any of these from orderedTitles if present
    orderedTitles = orderedTitles.filter((t) => !hebrewFirst.includes(t));
    // Prepend them in the correct order if present in titleToKeys
    const presentFirst = hebrewFirst.filter((t) => Object.keys(titleToKeys).includes(t));
    orderedTitles = [...presentFirst, ...orderedTitles];
    // Move claimant, layer, error to the end in the specified order
    const lastTitles = ['נושה', 'עו"ד מייצג', 'שגיאה'];
    orderedTitles = orderedTitles.filter((t) => !lastTitles.includes(t));
    orderedTitles = [...orderedTitles, ...lastTitles];
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Results', {
      views: [{rightToLeft: true, state: 'frozen', ySplit: 1}],
    });
    // Add header row
    worksheet.addRow(orderedTitles);
    // Style header row and add borders
    orderedTitles.forEach((title, colIdx) => {
      const cell = worksheet.getCell(1, colIdx + 1);
      cell.font = {bold: true};
      cell.alignment = {horizontal: 'center', vertical: 'middle'};
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: 'FFDDEEFF'},
      };
      cell.border = {
        top: {style: 'thin'},
        left: {style: 'thin'},
        bottom: {style: 'thin'},
        right: {style: 'thin'},
      };
    });
    // Add data rows and borders
    // Find the column indices for the date columns
    const kinusColIdx = orderedTitles.indexOf('תאריך צו כינוס');
    const pshitaColIdx = orderedTitles.indexOf('תאריך צו פתיחת הליכים/פירוק');
    const cancellationColIdx = orderedTitles.indexOf('תאריך ביטול/חיסול/עיכוב הצו');
    results.forEach((row, rowIdx) => {
      // For each title, use the first non-empty value from its mapped keys
      const rowData = orderedTitles.map((title) => {
        const keys = Array.isArray(titleToKeys[title]) ? titleToKeys[title] : [];
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== '') {
            return row[key];
          }
        }
        return '';
      });
      worksheet.addRow(rowData);
      orderedTitles.forEach((title, colIdx) => {
        const cell = worksheet.getCell(rowIdx + 2, colIdx + 1);
        cell.border = {
          top: {style: 'thin'},
          left: {style: 'thin'},
          bottom: {style: 'thin'},
          right: {style: 'thin'},
        };
        // Format date columns as Excel dates (if value is a valid date string)
        if (
          (colIdx === kinusColIdx || colIdx === pshitaColIdx || colIdx === cancellationColIdx) &&
          typeof cell.value === 'string' &&
          cell.value.trim()
        ) {
          // Try to parse as DD/MM/YY or DD/MM/YYYY
          const parts = cell.value.trim().split(/[\/\-]/);
          if (parts.length >= 3) {
            let [day, month, year] = parts;
            if (year.length === 2) year = '20' + year;
            const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
            if (!isNaN(dateObj.getTime())) {
              cell.value = dateObj;
              cell.numFmt = 'dd/mm/yyyy';
            }
          }
        }
        // If this is the claimant column and contains |
        if (title === 'נושה' && typeof cell.value === 'string' && cell.value.includes('|')) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: {argb: 'FFB3E5FC'}, // Light blue
          };
        }
      });
    });
    // Auto width for columns
    worksheet.columns.forEach((column, colIdx) => {
      let maxLength = 10; // Minimum width
      column.eachCell({includeEmpty: true}, (cell) => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) {
          maxLength = cellValue.length;
        }
      });
      column.width = maxLength + 2; // Add padding
    });
    // Enable auto-filter for all columns
    worksheet.autoFilter = {
      from: {row: 1, column: 1},
      to: {row: 1, column: orderedTitles.length},
    };
    // --- ADDITIONAL SHEET FOR THIS MONTH ---
    // Get current month and year
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    // Helper to check if a date is in this month
    function isThisMonth(val) {
      if (!val) return false;
      let d = val;
      if (typeof d === 'string') {
        // Try to parse as DD/MM/YY or DD/MM/YYYY
        const parts = d.trim().split(/[\/\-]/);
        if (parts.length >= 3) {
          let [day, m, y] = parts;
          if (y.length === 2) y = '20' + y;
          d = new Date(Number(y), Number(m) - 1, Number(day));
        } else {
          return false;
        }
      }
      if (!(d instanceof Date) || isNaN(d.getTime())) return false;
      return d.getMonth() === month && d.getFullYear() === year;
    }

    // Find the column indices for the date columns (K and M)
    const kinusColIdx2 = orderedTitles.indexOf('תאריך צו כינוס');
    const cancellationColIdx2 = orderedTitles.indexOf('תאריך ביטול/חיסול/עיכוב הצו');

    // Filter rows for this month (K or M in this month, or both)
    const filteredRows = [];
    for (let i = 0; i < worksheet.rowCount - 1; i++) {
      const row = worksheet.getRow(i + 2);
      const kinusVal = row.getCell(kinusColIdx2 + 1).value;
      const cancelVal = row.getCell(cancellationColIdx2 + 1).value;
      const kinusThisMonth = isThisMonth(kinusVal);
      const cancelThisMonth = isThisMonth(cancelVal);
      if (kinusThisMonth || cancelThisMonth) {
        filteredRows.push(row.values.slice(1));
      }
    }

    // Add new sheet
    const pad = (n) => n.toString().padStart(2, '0');
    const sheetName = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear().toString().slice(-2)}`;
    const monthSheet = workbook.addWorksheet(sheetName, {
      views: [{rightToLeft: true, state: 'frozen', ySplit: 1}],
    });
    monthSheet.addRow(orderedTitles);
    filteredRows.forEach((rowData) => monthSheet.addRow(rowData));
    // Style header row and add borders for new sheet
    orderedTitles.forEach((title, colIdx) => {
      const cell = monthSheet.getCell(1, colIdx + 1);
      cell.font = {bold: true};
      cell.alignment = {horizontal: 'center', vertical: 'middle'};
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {argb: 'FFDDEEFF'},
      };
      cell.border = {
        top: {style: 'thin'},
        left: {style: 'thin'},
        bottom: {style: 'thin'},
        right: {style: 'thin'},
      };
    });
    // Add borders to data rows in new sheet
    for (let rowIdx = 2; rowIdx <= monthSheet.rowCount; rowIdx++) {
      orderedTitles.forEach((title, colIdx) => {
        const cell = monthSheet.getCell(rowIdx, colIdx + 1);
        cell.border = {
          top: {style: 'thin'},
          left: {style: 'thin'},
          bottom: {style: 'thin'},
          right: {style: 'thin'},
        };
      });
    }
    // Auto width for columns in new sheet
    monthSheet.columns.forEach((column, colIdx) => {
      let maxLength = 10;
      column.eachCell({includeEmpty: true}, (cell) => {
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) {
          maxLength = cellValue.length;
        }
      });
      column.width = maxLength + 2;
    });
    // Enable auto-filter for all columns in new sheet
    monthSheet.autoFilter = {
      from: {row: 1, column: 1},
      to: {row: 1, column: orderedTitles.length},
    };
    // Freeze header row (already set in views)
    await workbook.xlsx.writeFile(outputFile);
    return outputFile;
  } catch (err) {
    console.error('Error in exportToXLSX:', err);
    throw err;
  }
}

// Main processing function for worker and CLI
async function processRows(rows, extendedTitles, outputFile) {
  // Use englishToHebrew for column titles
  const checker = new InsolvencyChecker();
  let results = await checker.process(rows);
  // Map cell_1 to individualDebtor if present and individualDebtor is missing or empty, then remove cell_1
  results = results.map((r, idx) => {
    let updated = {...r};
    // Map cell_1 to individualDebtor if needed
    if ((updated.individualDebtor === undefined || updated.individualDebtor === '') && updated.cell_1) {
      updated.individualDebtor = updated.cell_1.replace(/^\s+|\s+$/g, '');
    }
    // Remove all cell_ fields and personId
    Object.keys(updated).forEach((key) => {
      if (/^cell_\d+$/.test(key) || key === 'personId') {
        delete updated[key];
      }
    });
    // Merge all original input fields into the result except personId
    if (rows[idx]) {
      for (const inputKey of Object.keys(rows[idx])) {
        if (inputKey === 'personId') continue;
        if (updated[inputKey] === undefined) {
          updated[inputKey] = rows[idx][inputKey];
        }
      }
    }
    // Remap all keys to Hebrew
    const hebrewRow = {};
    for (const key of Object.keys(updated)) {
      const hebKey = englishToHebrew[key] || key;
      hebrewRow[hebKey] = updated[key];
    }
    return hebrewRow;
  });
  if (outputFile.endsWith('.json')) {
    await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
  } else {
    await fs.writeFile(outputFile.replace('.xlsx', '.json'), JSON.stringify(results, null, 2));
    await exportToXLSX(results, englishToHebrew, outputFile);
  }
  return results;
}

// Worker thread entry
if (!isMainThread && parentPort) {
  // You may want to pass extendedTitles and outputFile via workerData
  const {rows, extendedTitles, outputFile} = workerData;
  processRows(rows, extendedTitles, outputFile)
    .then((results) => parentPort.postMessage(results))
    .catch((err) => parentPort.postMessage({error: err.message}));
}

// CLI entry
if (isMainThread && require.main === module) {
  // Set Hebrew window title for Windows console
  function setConsoleTitle(title) {
    if (process.platform === 'win32') {
      process.title = title;
      try {
        require('child_process').exec(`title ${title}`);
      } catch (e) {}
    }
  }
  setConsoleTitle('בדיקת חדלות פירעון - התחלה');
  // Example usage: node index.js [--headless]
  function formatDate(d) {
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear().toString().slice(-2)} ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}:${pad(d.getSeconds())}`;
  }
  (async () => {
    const startTime = new Date();
    console.log(`[${formatDate(startTime)}] Headless run started`);
    // Use literal require so pkg can statically include the file
    const {readLatestXLSXtoJSON} = require('./io/readFile.js');
    const inputDir = path.join(__dirname, 'input');
    // Parse --outputDir=... from process.argv, default to output
    let outputDir = 'output';
    for (const arg of process.argv) {
      if (arg.startsWith('--outputDir=')) {
        outputDir = arg.split('=')[1];
      }
    }
    outputDir = path.join(__dirname, outputDir);
    await fs.mkdir(outputDir, {recursive: true});
    const {file: inputFilePath, rows, titles: extendedTitles, errors: invalidIds} = await readLatestXLSXtoJSON(inputDir);
    // Use input file name (without extension) for output file name
    const inputBaseName = path.basename(inputFilePath, path.extname(inputFilePath));
    let outputFile;
    if (outputDir.endsWith(path.sep + 'output')) {
      const now = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const ts = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear().toString().slice(-2)}-${pad(now.getHours())}-${pad(
        now.getMinutes()
      )}`;
      outputFile = path.join(outputDir, `${inputBaseName}-${ts}.xlsx`);
    } else {
      outputFile = path.join(outputDir, `${inputBaseName}.xlsx`);
    }
    // Update the console title to show process and output file name
    setConsoleTitle(`בדיקת חדלות פירעון - ${path.basename(outputFile)}`);
    // Create checker instance so we can close it after processing
    const checker = new InsolvencyChecker();
    let results = await checker.process(rows);
    // Map cell_1 to individualDebtor if present and individualDebtor is missing or empty, then remove cell_1
    results = results.map((r, idx) => {
      let updated = {...r};
      if ((updated.individualDebtor === undefined || updated.individualDebtor === '') && updated.cell_1) {
        updated.individualDebtor = updated.cell_1.replace(/^+|\s+$/g, '');
      }
      Object.keys(updated).forEach((key) => {
        if (/^cell_\d+$/.test(key) || key === 'personId') {
          delete updated[key];
        }
      });
      if (rows[idx]) {
        for (const inputKey of Object.keys(rows[idx])) {
          if (inputKey === 'personId') continue;
          if (updated[inputKey] === undefined) {
            updated[inputKey] = rows[idx][inputKey];
          }
        }
      }
      const hebrewRow = {};
      for (const key of Object.keys(updated)) {
        const hebKey = englishToHebrew[key] || key;
        hebrewRow[hebKey] = updated[key];
      }
      return hebrewRow;
    });
    if (outputFile.endsWith('.json')) {
      await fs.writeFile(outputFile, JSON.stringify(results, null, 2));
    } else {
      await fs.writeFile(outputFile.replace('.xlsx', '.json'), JSON.stringify(results, null, 2));
      await exportToXLSX(results, englishToHebrew, outputFile);
    }
    if (outputDir.endsWith(path.sep + 'output')) {
      console.log(`Results saved to ${outputFile} and ${outputFile.replace('.xlsx', '.json')}`);
    } else {
      console.log(`Results saved to ${outputFile} and ${outputFile.replace('.xlsx', '.json')}`);
    }
    // Open the XLSX file in the default application on Windows
    if (process.platform === 'win32') {
      try {
        require('child_process').exec(`start "" "${outputFile}"`);
      } catch (e) {
        console.error('Failed to open XLSX file:', e.message);
      }
    }
    // Update the console title to indicate finished
    setConsoleTitle(`בדיקת חדלות פירעון - הסתיים (${path.basename(outputFile)})`);
    const endTime = new Date();
    console.log(`[${formatDate(endTime)}] Headless run finished`);
    // Print invalid IDs again at the very end, after execution time
    if (invalidIds && invalidIds.length > 0) {
      console.error('Summary of invalid IDs:');
      invalidIds.forEach((e) => {
        console.error(`Row ${e.row}: raw='${e.personalID}', cleaned='${e.cleanedID}'`);
      });
    }
    await checker.close();
  })();
}

// Export for main.js
module.exports = {processRows, exportToXLSX};
