# Insolvency Checker

A Node.js Playwright automation project to check personal IDs for debt status on the Israeli insolvency website.

## Features

- Automated form filling and submission
- Batch processing of multiple personal IDs
- Detection of debt records in results table
- Automatic page cleaning between searches
- Results export to JSON and CSV formats
- Error handling and logging

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Install Playwright browsers:
```bash
pnpm run install-browsers
```

## Usage

### Method 1: Using the IDs file

1. Edit `ids.txt` and add the personal IDs you want to check (one per line)
2. Run the script:
```bash
pnpm start
```

### Method 2: Programmatic usage

```javascript
const InsolvencyChecker = require('./index.js');

async function checkIds() {
    const checker = new InsolvencyChecker();
    await checker.init();
    
    const idList = ['123456789', '987654321'];
    const results = await checker.processIdList(idList);
    
    await checker.saveResults(results);
    checker.printSummary(results);
    await checker.close();
}

checkIds();
```

## Configuration

You can modify the following settings in the `InsolvencyChecker` constructor:

- `headless: false` - Set to `true` to run without opening browser window
- `slowMo: 1000` - Delay between actions in milliseconds (for debugging)

## Output

The script generates two output files:

1. `debt_check_results.json` - Detailed results in JSON format
2. `debt_check_results.csv` - Simple CSV format for spreadsheet viewing

### Result Status Codes

- `NO_DEBT` - Person has no debt records
- `DEBT_FOUND` - Person has debt records in the system
- `ERROR` - Error occurred during check

## How it works

1. Opens the Israeli insolvency website
2. For each personal ID:
   - Clears any previous search results
   - Enters the ID in the search field
   - Clicks the search button
   - Checks if the results table contains any data rows
   - Records the result
3. Saves all results to files
4. Prints a summary

## Important Notes

- The script includes delays between requests to be respectful to the server
- Make sure you have a stable internet connection
- The script runs in non-headless mode by default so you can see what's happening
- Always verify results manually for important decisions

## Troubleshooting

If you encounter issues:

1. Make sure you have the latest version of Node.js installed
2. Check your internet connection
3. Verify the website is accessible
4. Try running with `headless: false` to see what's happening in the browser

## Legal Notice

This tool is for educational and legitimate business purposes only. Always comply with the website's terms of service and applicable laws.