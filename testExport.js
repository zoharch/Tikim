const fs = require('fs/promises');
const path = require('path');
const {exportToXLSX} = require('./index.js');

// Load JSON data
async function testExport() {
  const jsonPath = path.join(__dirname, 'output', 'results-07-11-25-19-05.json');
  const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

  // Get the mapping from index.js (or copy it here if not exported)
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

  const outputFile = path.join(__dirname, 'output', 'test-export.xlsx');
  console.log('Data length:', data.length);
  await exportToXLSX(data, englishToHebrew, outputFile);
  console.log('Export complete:', outputFile);
}

testExport();
