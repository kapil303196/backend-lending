/**
 * xlsx-to-csv.js
 * Converts large XLSX files to CSV (first sheet only)
 * Uses streaming write to handle large files efficiently
 *
 * Usage: node scripts/xlsx-to-csv.js <input.xlsx> [output.csv]
 * If output is not specified, it will use the same name as input with .csv extension
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
    console.error('Usage: node xlsx-to-csv.js <input.xlsx> [output.csv]');
    console.error('Example: node xlsx-to-csv.js files/data.xlsx files/data.csv');
    process.exit(1);
}

const inputFile = args[0];
const outputFile = args[1] || inputFile.replace(/\.xlsx?$/i, '.csv');

// Check if input file exists
if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
}

console.log(`Input file: ${inputFile}`);
console.log(`Output file: ${outputFile}`);

// Get file size for progress reporting
const stats = fs.statSync(inputFile);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`File size: ${fileSizeMB} MB`);
console.log('');

// Start timing
const startTime = Date.now();

console.log('Reading XLSX file (this may take a while for large files)...');

// Read the workbook with options optimized for large files
// Using { dense: false } (default) for sparse representation which uses less memory
const workbook = XLSX.readFile(inputFile, {
    // Don't parse formulas, just get values
    cellFormula: false,
    // Don't parse cell styles
    cellStyles: false,
    // Don't parse cell comments
    cellNF: false,
    // Sheet range - only read what's needed
    sheetRows: 0, // 0 = all rows
});

const readTime = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`XLSX file loaded in ${readTime}s`);

// Get the first sheet
const sheetNames = workbook.SheetNames;
if (sheetNames.length === 0) {
    console.error('Error: No sheets found in the workbook');
    process.exit(1);
}

const firstSheetName = sheetNames[0];
console.log(`Processing sheet: "${firstSheetName}"`);

const worksheet = workbook.Sheets[firstSheetName];

// Get the range of the worksheet
const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
const totalRows = range.e.r - range.s.r + 1;
const totalCols = range.e.c - range.s.c + 1;
console.log(`Sheet dimensions: ${totalRows} rows x ${totalCols} columns`);
console.log('');

// Create write stream for output
const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });

// Helper function to escape CSV values
function escapeCSVValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    
    const str = String(value);
    
    // Check if we need to quote the value
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Escape double quotes by doubling them and wrap in quotes
        return '"' + str.replace(/"/g, '""') + '"';
    }
    
    return str;
}

// Helper function to get cell value
function getCellValue(worksheet, row, col) {
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    const cell = worksheet[cellAddress];
    
    if (!cell) return '';
    
    // Return the formatted value if available, otherwise the raw value
    if (cell.w !== undefined) return cell.w; // formatted string
    if (cell.v !== undefined) return cell.v; // raw value
    return '';
}

console.log('Converting to CSV...');

let rowsProcessed = 0;
let lastProgressUpdate = Date.now();
const progressInterval = 1000; // Update progress every second

// Process rows and write to CSV
for (let row = range.s.r; row <= range.e.r; row++) {
    const rowValues = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
        const value = getCellValue(worksheet, row, col);
        rowValues.push(escapeCSVValue(value));
    }
    
    // Write the row
    writeStream.write(rowValues.join(',') + '\n');
    
    rowsProcessed++;
    
    // Show progress periodically
    const now = Date.now();
    if (now - lastProgressUpdate >= progressInterval) {
        const percent = ((rowsProcessed / totalRows) * 100).toFixed(1);
        const rowsPerSec = Math.round(rowsProcessed / ((now - startTime) / 1000));
        process.stdout.write(`\rProgress: ${percent}% (${rowsProcessed.toLocaleString()}/${totalRows.toLocaleString()} rows) - ${rowsPerSec.toLocaleString()} rows/s`);
        lastProgressUpdate = now;
    }
}

// Finish writing
writeStream.end();

writeStream.on('finish', () => {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const outputStats = fs.statSync(outputFile);
    const outputSizeMB = (outputStats.size / (1024 * 1024)).toFixed(2);
    
    console.log('\n');
    console.log('='.repeat(50));
    console.log('Conversion complete!');
    console.log('='.repeat(50));
    console.log(`Total rows: ${totalRows.toLocaleString()}`);
    console.log(`Total columns: ${totalCols}`);
    console.log(`Output file size: ${outputSizeMB} MB`);
    console.log(`Total time: ${totalTime}s`);
    console.log(`Output saved to: ${outputFile}`);
});

writeStream.on('error', (err) => {
    console.error('\nError writing to output file:', err.message);
    process.exit(1);
});
