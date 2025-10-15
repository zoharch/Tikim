const { chromium } = require('playwright');
const fs = require('fs').promises;

const inputFile = 'ids.txt';
const outputFile = 'debt_check_results.json';

class InsolvencyChecker {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://insolvency.justice.gov.il/poshtim/main/tikim/wfrmlisttikim.aspx';
    }

    async init() {
        console.log('Initializing browser...');
        const headless = (this._headless !== undefined) ? this._headless : false;
        this.browser = await chromium.launch({ 
            headless,
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

            let rowDetails = await this.page.evaluate(() => {
                const table = document.querySelector('#lstData_grdDataList');
                if (table && table.rows.length > 0) {
                    const firstRow = table.rows[0];
                    if (firstRow && firstRow.cells.length > 0) {
                        return Array.from(firstRow.cells).map(cell => cell.innerText.trim());
                    }
                }
                return [];
            });

            let pratimIndex = -1;
            let kinusDate = null;
            if (rowDetails.length > 0) {
                for (let i = 0; i < rowDetails.length; i++) {
                    if (rowDetails[i] === 'פרטים') {
                        pratimIndex = i;
                        try {
                            const pratimSelector = `#lstData_grdDataList tr td:nth-child(${i + 1}) a`;
                            const pratimLink = await this.page.$(pratimSelector);
                            if (pratimLink) {
                                await pratimLink.click();
                                await this.page.waitForSelector('#lstTikGeneralDetails_txtTzavKinusDate', { timeout: 10000 });
                                kinusDate = await this.page.$eval('#lstTikGeneralDetails_txtTzavKinusDate', el => el.value);
                                console.log(`Extracted kinus date: ${kinusDate}`);
                            } else {
                                console.log(`No clickable link found in 'פרטים' cell.`);
                            }
                        } catch (err) {
                            console.log(`Error clicking 'פרטים' or extracting date:`, err.message);
                        }
                        break;
                    }
                }
            }

            const hasDebt = rowDetails.length > 0 && rowDetails[0] !== '';
            return {
                personId: personId,
                hasDebt: hasDebt,
                status: hasDebt ? 'DEBT_FOUND' : 'NO_DEBT',
                details: hasDebt ? rowDetails : [],
                kinusDate: kinusDate || null
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
            const csvHeaders = ['Person ID', 'Has Debt', 'Status', ...detailHeaders, 'תאריך כינוס', 'Error'];
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
                    r.error || ''
                ].map(val => {
                    if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                        return '"' + val.replace(/"/g, '""') + '"';
                    }
                    return val;
                }).join(',');
            });
            const csvContent = '\uFEFF' + [csvHeaders.join(','), ...csvRows].join('\n');
            const csvFilename = filename.replace('.json', '.csv');
            // try {
            //     await fs.writeFile(csvFilename, csvContent, 'utf8');
            //     console.log(`CSV results saved to ${csvFilename}`);
            // } catch (csvErr) {
            //     errorLog.push(`CSV error: ${csvErr.message}`);
            //     console.error('Error saving CSV file:', csvErr.message);
            // }

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
    const checker = new InsolvencyChecker();
    if (options.headless !== undefined) {
        checker._headless = options.headless;
    }

    try {
        await fs.unlink(outputFile);
        console.log(`Removed previous ${outputFile}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.log(`Error removing ${outputFile}:`, err.message);
        }
    }

    let idList = [];
    let results = [];
    try {
        await checker.init(options);
        try {
            const fileContent = await fs.readFile(inputFile, 'utf8');
            idList = fileContent.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
            console.log(`Loaded ${idList.length} IDs from ${inputFile}`);
        } catch (error) {
            console.log(`${inputFile} not found, using example IDs`);
            idList = [
                '123456789',
                '987654321',
                '555666777'
            ];
        }
        if (idList.length === 0) {
            console.log('No IDs to process. Please add IDs to ids.txt file (one per line)');
            return;
        }
        results = await checker.processIdList(idList);
        await checker.saveResults(results);
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