const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const { readLatestXLSXtoJSON } = require('./io/readFile');

const outputDir = path.join(__dirname, 'output');
const outputFile = path.join(outputDir, 'debt_check_results.json');

class InsolvencyChecker {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://insolvency.justice.gov.il/poshtim/main/tikim/wfrmlisttikim.aspx';
        this.headless = options.headless === true;
    }

    async init() {
        console.log('Initializing browser...');
        this.browser = await chromium.launch({
            headless: this.headless,
            slowMo: 1000 // Add delay between actions for debugging
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
            await this.page.waitForSelector('input[name="rngListTikim$txtPoshetID"]', { timeout: 10000 });
            await this.page.fill('input[name="rngListTikim$txtPoshetID"]', personId);
            console.log(`Entered ID: ${personId}`);
            await this.page.click('input[id="btnSearch"]');
            console.log('Clicked search button');
            await this.page.waitForTimeout(1000);
            await this.page.waitForSelector('#lstData_GenericGridDiv', { timeout: 15000 });

            // Extract table headers and values as individual props
            let detailProps = {};
            let rowDetails = await this.page.evaluate(() => {
                const table = document.querySelector('#lstData_grdDataList');
                if (table && table.rows.length > 0) {
                    const firstRow = table.rows[0];
                    const headers = Array.from(table.parentElement.querySelectorAll('tr')[0].cells).map(cell => cell.innerText.trim());
                    const values = Array.from(firstRow.cells).map(cell => cell.innerText.trim());
                    return { headers, values };
                }
                return { headers: [], values: [] };
            });
            // Map Hebrew headers to English keys
            const hebrewToEnglish = {
                'מספר תיק': 'caseID',
                'מספר מזהה': 'personalID',
                'חייב יחיד': 'individualDebtor',
                'הממונה על חדלות פרעון': 'insolvencyCommissioner',
                'סוג תיק': 'caseType',
                'רשות מטפלת': 'handlingAuthority',
                'מספר תיק ממונה': 'commissionerCaseNumber',
                'מספר תיק בהמ"ש': 'courtCaseNumber',
                'מספר תיק רשות האכיפה': 'enforcementCaseNumber',
                'שם יחיד / תאגיד': 'debtorName',
                'מזהה יחיד / תאגיד': 'debtorId',
                'מחוז': 'district',
                'קישור': 'link',
                'פרטים': 'detailsLink'
            };
            if (rowDetails.headers.length === rowDetails.values.length) {
                for (let i = 0; i < rowDetails.headers.length; i++) {
                    const hebKey = rowDetails.headers[i];
                    let engKey = hebrewToEnglish[hebKey];
                    if (!engKey) {
                        // If not mapped, use cell_<number>
                        engKey = `cell_${i+1}`;
                    }
                    detailProps[engKey] = rowDetails.values[i];
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
                            // Extract each field independently
                            try {
                                await this.page.waitForSelector('#lstTikGeneralDetails_txtTzavKinusDate', { timeout: 5000 });
                                kinusDate = await this.page.$eval('#lstTikGeneralDetails_txtTzavKinusDate', el => el.value);
                            } catch (err) {
                                console.log('Error extracting תאריך כינוס:', err.message);
                            }
                            try {
                                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTzavPshitaDate"]', { timeout: 5000 });
                                pshitaDate = await this.page.$eval('[name="lstTikGeneralDetails$txtTzavPshitaDate"]', el => el.value);
                            } catch (err) {
                                console.log('Error extracting צו פתיחת הליכים/פירוק:', err.message);
                            }
                            try {
                                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTzavCancellationDate"]', { timeout: 5000 });
                                cancellationDate = await this.page.$eval('[name="lstTikGeneralDetails$txtTzavCancellationDate"]', el => el.value);
                            } catch (err) {
                                console.log('Error extracting ביטול/חיסול/עיכוב הצו:', err.message);
                            }
                            try {
                                await this.page.waitForSelector('[name="lstTikGeneralDetails$txtTikStatus"]', { timeout: 5000 });
                                tikStatus = await this.page.$eval('[name="lstTikGeneralDetails$txtTikStatus"]', el => el.value);
                            } catch (err) {
                                console.log('Error extracting סטטוס התיק:', err.message);
                            }
                            console.log(`Extracted kinus date: ${kinusDate}, צו פתיחת: ${pshitaDate}, ביטול/חיסול/עיכוב: ${cancellationDate}, סטטוס התיק: ${tikStatus}`);

                            // Now click the <a> with text 'תביעות החוב' and extract lawyer names
                            try {
                                console.log('Waiting for table mnuTikim_lstMenu...');
                                await this.page.waitForSelector('table#mnuTikim_lstMenu', { timeout: 20000 });
                                console.log('Found table mnuTikim_lstMenu.');
                                console.log('Searching for תביעות tab in mnuTikim_lstMenu...');
                                await this.page.waitForSelector('table#mnuTikim_lstMenu tr td', { timeout: 20000 });
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
                                    await this.page.waitForSelector('#lstData_grdDataList', { timeout: 20000 });
                                    await this.page.waitForTimeout(2000);
                                    console.log('Extracting lawyer names from lstData_grdDataList...');
                                    // Extract lawyer name only if matches 'אריה חגי', and also extract claimant (td before)
                                    const lawyerData = await this.page.evaluate(() => {
                                        const table = document.getElementById('lstData_grdDataList');
                                        if (!table) return null;
                                        const rows = Array.from(table.querySelectorAll('tr'));
                                        for (const tr of rows) {
                                            const tds = tr.querySelectorAll('td');
                                            if (tds.length > 2) {
                                                const lawyerName = tds[1].innerText.trim();
                                                if (lawyerName === 'אריה חגי') {
                                                    const claimant = tds[0].innerText.trim();
                                                    return { lawyerName, claimant };
                                                }
                                            }
                                        }
                                        return null;
                                    });
                                    if (lawyerData) {
                                        lawyerNames = [lawyerData.lawyerName];
                                        detailProps.claimant = lawyerData.claimant;
                                    } else {
                                        lawyerNames = [];
                                    }
                                    if (lawyerData) {
                                        console.log(`Done extracting Arie Hagay, claimant: ${detailProps.claimant || ''}`);
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
                layerName: lawyerNames.length > 0 ? lawyerNames[0] : '',
                claimant: detailProps.claimant || ''
            };
        } catch (error) {
            console.error(`Error checking person ID ${personId}:`, error.message);
            return {
                personId: personId,
                hasDebt: null,
                status: 'ERROR',
                error: error.message
            };
        }
    }

    async processIdList(idList) {
        const results = [];
        console.log(`Starting to process ${idList.length} IDs...`);
        for (let i = 0; i < idList.length; i++) {
            const personId = idList[i].trim();
            if (personId) {
                console.log(`\nProcessing ${i + 1}/${idList.length}: ${personId}`);
                await this.page.goto(this.baseUrl);
                await this.page.waitForLoadState('networkidle');
                const result = await this.checkPersonId(personId);
                results.push(result);
                if (i < idList.length - 1) {
                    console.log('Waiting before next request...');
                    await this.page.waitForTimeout(2000);
                }
            }
        }
        return results;
    }

    async saveResults(results, filename = outputFile) {
        let errorLog = [];
        try {
            const timestamp = new Date().toISOString();
            const output = {
                timestamp: timestamp,
                totalChecked: results.length,
                withDebt: results.filter(r => r.hasDebt === true).length,
                withoutDebt: results.filter(r => r.hasDebt === false).length,
                errors: results.filter(r => r.status === 'ERROR').length,
                results: results
            };
            await fs.writeFile(filename, JSON.stringify(output, null, 2));
            console.log(`\nResults saved to ${filename}`);

            const detailHeaders = [
                'סוג תיק',
                'רשות מטפלת',
                'מספר תיק ממונה',
                'מספר תיק בהמ"ש',
                'מספר תיק רשות האכיפה',
                'שם יחיד / תאגיד',
                'מזהה יחיד / תאגיד',
                'מחוז',
                'קישור'
            ];
            const csvHeaders = ['תעודת זהות', 'יש חוב ?', 'סטטוס', ...detailHeaders, 'תאריך צו פתיחת הליכים/צו כינוס', 'תאריך צו פתיחת הליכים/פירוק', 'תאריך ביטול/חיסול/עיכוב הצו', 'סטטוס התיק', 'Error'];
            const maxDetailsLen = detailHeaders.length;
            const csvRows = results.map(r => {
                const details = Array.isArray(r.details) ? r.details : [];
                const paddedDetails = [...details, ...Array(maxDetailsLen - details.length).fill('')];
                return [
                    r.personId,
                    r.hasDebt,
                    r.status,
                    ...paddedDetails,
                    r.kinusDate || '',
                    r.pshitaDate || '',
                    r.cancellationDate || '',
                    r.tikStatus || '',
                    r.error || ''
                ].map(val => {
                    if (typeof val === 'string' && (val.includes(',') || val.includes('"')))
                        return '"' + val.replace(/"/g, '""') + '"';
                    return val;
                }).join(',');
            });
            const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows].join('\n');
            const csvFilename = filename.replace('.json', '.csv');
            // ...existing code...

            try {
                const xlsx = require('xlsx');
                const xlsxRows = results.map(r => {
                    const details = Array.isArray(r.details) ? r.details : [];
                    const paddedDetails = [...details, ...Array(detailHeaders.length - details.length).fill('')];
                    return [
                        r.personId,
                        r.hasDebt,
                        r.status,
                        ...paddedDetails,
                        r.kinusDate || '',
                        r.pshitaDate || '',
                        r.cancellationDate || '',
                        r.tikStatus || '',
                        r.error || ''
                    ];
                });
                const xlsxData = [csvHeaders, ...xlsxRows];
                if (xlsxData.length > 1) {
                    const ws = xlsx.utils.aoa_to_sheet(xlsxData);
                    const wb = xlsx.utils.book_new();
                    xlsx.utils.book_append_sheet(wb, ws, 'Results');
                    const xlsxFilename = filename.replace('.json', '.xlsx');
                    xlsx.writeFile(wb, xlsxFilename);
                    console.log(`XLSX results saved to ${xlsxFilename}`);
                } else {
                    errorLog.push('No data to write to XLSX file.');
                    console.log('No data to write to XLSX file.');
                }
            } catch (err) {
                errorLog.push(`XLSX error: ${err.message}`);
                console.error('Error saving XLSX file:', err.message);
            }

            if (errorLog.length > 0) {
                try {
                    await fs.writeFile('error_log.txt', errorLog.join('\n'), 'utf8');
                    console.log('Errors logged to error_log.txt');
                } catch (logErr) {
                    console.error('Failed to write error log:', logErr.message);
                }
            }
        } catch (error) {
            try {
                await fs.writeFile('error_log.txt', error.message, 'utf8');
                console.error('Main error logged to error_log.txt');
            } catch (logErr) {
                console.error('Failed to write main error log:', logErr.message);
            }
            console.error('Error saving results:', error.message);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('Browser closed');
        }
    }

    printSummary(results) {
        console.log('\n=== SUMMARY ===');
        console.log(`Total IDs checked: ${results.length}`);
        console.log(`With debt: ${results.filter(r => r.hasDebt === true).length}`);
        console.log(`Without debt: ${results.filter(r => r.hasDebt === false).length}`);
        console.log(`Errors: ${results.filter(r => r.status === 'ERROR').length}`);
        const withDebt = results.filter(r => r.hasDebt === true);
        if (withDebt.length > 0) {
            console.log('\nIDs with debt:');
            withDebt.forEach(r => console.log(`  - ${r.personId}`));
        }
    }
}

// Main function
async function main(options = {}) {
    const checker = new InsolvencyChecker(options);

    // Ensure output directory exists and clean its content
    try {
        await fs.mkdir(outputDir, { recursive: true });
        const files = await fs.readdir(outputDir);
        for (const file of files) {
            const filePath = path.join(outputDir, file);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error(`Failed to remove ${filePath}:`, err.message);
            }
        }
        console.log('Cleaned output directory.');
    } catch (err) {
        console.error('Failed to create or clean output directory:', err.message);
        return;
    }

    let inputJson = null;
    let idList = [];
    let results = [];
    try {
        await checker.init(options);
        try {
            // Use readLatestXLSXtoJSON to get input data
            const inputDir = path.join(__dirname, 'input');
            inputJson = await readLatestXLSXtoJSON(inputDir);
            // Extract personalIDs from input rows
            idList = inputJson.rows.map(row => row.personalID).filter(Boolean);
            console.log(`idList: ${JSON.stringify(idList)}`);
            console.log(`Loaded ${idList.length} personalIDs from input XLSX`);
        } catch (error) {
            console.log('No valid input XLSX found, using example IDs');
            idList = [
                '123456789',
                '987654321',
                '555666777'
            ];
            inputJson = { rows: [], titles: {} };
        }
        if (idList.length === 0) {
            console.log('No personalIDs to process. Please add rows to the input XLSX file.');
            return;
        }
        // Map personalID to input row for easy lookup
        const inputRowMap = {};
        for (const row of inputJson.rows) {
            if (row.personalID) inputRowMap[row.personalID] = row;
        }
        // Get results from checker
        const rawResults = await checker.processIdList(idList);
        // Extend each result with input row
        results = rawResults.map(r => {
            const inputRow = inputRowMap[r.personId] || {};
            return { ...inputRow, ...r };
        });

        // Build extended titles object
        const inputTitles = inputJson.titles || {};
        // Collect all keys from results, ensure caseID is first, personalID is present
        let allKeysArr = Array.from(new Set(Object.keys(inputTitles)));
        for (const obj of results) {
            Object.keys(obj).forEach(k => {
                if (!allKeysArr.includes(k)) allKeysArr.push(k);
            });
        }
        // Ensure caseID is first, personalID is present
        allKeysArr = allKeysArr.filter(k => k !== 'caseID' && k !== 'personalID');
        allKeysArr = ['caseID', 'personalID', ...allKeysArr];
        const allKeys = new Set(allKeysArr);
        // Extend titles with readable names for new props
        const extendedTitles = { ...inputTitles };
        // Add Hebrew mapping for English keys
        const englishToHebrew = {
            personId: inputTitles.personalID || 'מספר מזהה',
            hasDebt: 'יש חוב ?',
            status: 'סטטוס',
            caseType: 'סוג תיק',
            handlingAuthority: 'רשות מטפלת',
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
            'עו"ד מייצג': 'עו"ד מייצג',
            error: 'שגיאה',
            cell_3: 'מחוז',
            cell_4: 'מזהה יחיד / תאגיד',
            cell_5: 'שם יחיד / תאגיד',
            cell_6: 'מספר תיק רשות האכיפה',
            cell_7: 'מספר תיק בהמ"ש',
            cell_8: 'מספר תיק ממונה'
        };
        for (const k of allKeys) {
            if (!(k in extendedTitles)) {
                extendedTitles[k] = englishToHebrew[k] || k;
            }
        }

        // Build output JSON
        const outputJson = {
            timestamp: new Date().toISOString(),
            totalChecked: results.length,
            withDebt: results.filter(r => r.hasDebt === true).length,
            withoutDebt: results.filter(r => r.hasDebt === false).length,
            errors: results.filter(r => r.status === 'ERROR').length,
            titles: extendedTitles,
            results: results
        };

        // Save output JSON
        await fs.writeFile(outputFile, JSON.stringify(outputJson, null, 2));
        console.log(`\nResults saved to ${outputFile}`);

        // Create XLSX from outputJson
        try {
            const xlsx = require('xlsx');
            const headerKeys = Object.keys(extendedTitles);
            const xlsxRows = results.map(obj => headerKeys.map(k => obj[k]));
            const xlsxData = [headerKeys.map(k => extendedTitles[k]), ...xlsxRows];
            if (xlsxData.length > 1) {
                const ws = xlsx.utils.aoa_to_sheet(xlsxData);
                // Enable auto-filter for all columns
                ws['!autofilter'] = { ref: `A1:${String.fromCharCode(65 + headerKeys.length - 1)}1` };
                const wb = xlsx.utils.book_new();
                xlsx.utils.book_append_sheet(wb, ws, 'Results');
                const xlsxFilename = outputFile.replace('.json', '.xlsx');
                xlsx.writeFile(wb, xlsxFilename);
                console.log(`XLSX results saved to ${xlsxFilename}`);
            } else {
                console.log('No data to write to XLSX file.');
            }
        } catch (err) {
            console.error('Error saving XLSX file:', err.message);
        }

        checker.printSummary(results);
    } catch (error) {
        console.error('Main execution error:', error.message);
        try {
            await fs.writeFile('error_log.txt', error.message, 'utf8');
            console.error('Main error logged to error_log.txt');
        } catch (logErr) {
            console.error('Failed to write main error log:', logErr.message);
        }
    }
    await checker.close();
}

module.exports = { InsolvencyChecker, main };

if (require.main === module) {
    const isHeadless = process.argv.includes('--headless');
    main({ headless: isHeadless }).catch(console.error);
}