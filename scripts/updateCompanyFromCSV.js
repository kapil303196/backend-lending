/**
 * updateCompanyFromCSV.js
 * Reads a CSV file with uniqueId and Name columns
 * Matches uniqueId in the database and updates the company field with Name
 * 
 * Usage: node scripts/updateCompanyFromCSV.js <path-to-csv-file>
 * Example: node scripts/updateCompanyFromCSV.js files/update-companies.csv
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const csv = require('csv-parse');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

// Import the MCA model
const MCA = require('../models/MCA');

// ---------------------- Config ----------------------
const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB;

// Batch size for bulk operations (higher = faster, but more memory)
const BATCH_SIZE = 1000;

// Get CSV file path from command line argument
const CSV_FILE = process.argv[2] || path.resolve(__dirname, '../files/23-dec-correct-names.csv');

// ---------------------- Helper Functions ----------------------

/**
 * Parse CSV file and return array of records
 */
async function parseCSV(filePath) {
    const records = [];
    
    if (filePath.endsWith('.xlsx')) {
        console.log('📖 Detected .xlsx file, using SheetJS...');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
        
        // Filter out empty rows
        const data = rawData.filter(row => {
            const values = Object.values(row);
            return values.some(val => val !== null && val !== undefined && String(val).trim() !== '');
        });
        
        console.log(`📊 Found ${data.length} records in Excel file`);
        return data;
    } else {
        console.log('📖 Reading CSV file...');
        
        // Read first line to detect delimiter
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const firstLine = fileContent.split(/\r?\n/)[0];
        const delimiter = firstLine.includes('\t') ? '\t' : ',';
        
        // Parse CSV
        return new Promise((resolve, reject) => {
            const parser = csv.parse({
                columns: true,
                skip_empty_lines: true,
                delimiter: delimiter,
                relax_column_count: true
            });
            
            const results = [];
            
            parser.on('readable', function() {
                let record;
                while ((record = parser.read()) !== null) {
                    results.push(record);
                }
            });
            
            parser.on('error', function(err) {
                reject(err);
            });
            
            parser.on('end', function() {
                console.log(`📊 Found ${results.length} records in CSV file`);
                resolve(results);
            });
            
            // Write file content to parser
            fs.createReadStream(filePath).pipe(parser);
        });
    }
}

/**
 * Normalize header names to handle variations
 */
function normalizeHeader(header) {
    if (!header) return null;
    const cleaned = String(header).trim().replace(/^\uFEFF/, '').toLowerCase();
    
    // Map common variations
    const mapping = {
        'uniqueid': 'uniqueId',
        'unique id': 'uniqueId',
        'unique_id': 'uniqueId',
        'id': 'uniqueId',
        'name': 'Name',
        'company': 'Name',
        'company name': 'Name',
        'companyname': 'Name'
    };
    
    return mapping[cleaned] || cleaned;
}

/**
 * Extract uniqueId and Name from a record, handling various header formats
 */
function extractData(record) {
    let uniqueId = null;
    let name = null;
    
    // Try to find uniqueId
    for (const [key, value] of Object.entries(record)) {
        const normalized = normalizeHeader(key);
        if (normalized === 'uniqueId' || key === 'uniqueId' || key === 'UniqueId' || key === 'UNIQUEID') {
            uniqueId = String(value || '').trim();
            break;
        }
    }
    
    // Try to find Name
    for (const [key, value] of Object.entries(record)) {
        const normalized = normalizeHeader(key);
        if (normalized === 'name' || key === 'Name' || key === 'name' || key === 'NAME' || 
            key === 'company' || key === 'Company' || key === 'COMPANY') {
            name = String(value || '').trim();
            break;
        }
    }
    
    return { uniqueId, name };
}

// ---------------------- Main Function ----------------------

async function run() {
    try {
        // Validate file exists
        const filePath = path.resolve(CSV_FILE);
        if (!fs.existsSync(filePath)) {
            throw new Error(`CSV file not found: ${filePath}`);
        }
        
        console.log(`\n📁 Reading file: ${filePath}`);
        
        // Parse CSV
        const records = await parseCSV(filePath);
        
        if (records.length === 0) {
            throw new Error('No records found in CSV file');
        }
        
        // Show first record for debugging
        console.log('\n🔍 Sample record:', records[0]);
        
        // Connect to MongoDB
        console.log('\n🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);
        
        // Get the collection for bulk operations
        const collection = mongoose.connection.db.collection('MCA');
        
        // Process records
        let processed = 0;
        let updated = 0;
        let notFound = 0;
        let skipped = 0;
        const errors = [];
        const notFoundIds = [];
        
        console.log(`\n🔄 Processing ${records.length} records in batches of ${BATCH_SIZE}...\n`);
        
        // Prepare bulk operations
        const bulkOps = [];
        const recordMap = new Map(); // Map uniqueId to name for tracking
        
        // First pass: collect valid records
        for (let i = 0; i < records.length; i++) {
            const record = records[i];
            const { uniqueId, name } = extractData(record);
            
            // Skip if missing required fields
            if (!uniqueId || uniqueId === '') {
                skipped++;
                continue;
            }
            
            if (!name || name === '') {
                skipped++;
                continue;
            }
            
            // Add to bulk operations
            bulkOps.push({
                updateOne: {
                    filter: { uniqueId: uniqueId },
                    update: {
                        $set: {
                            company: name,
                            updatedAt: new Date()
                        }
                    },
                    upsert: false // Don't create new records, only update existing
                }
            });
            
            recordMap.set(uniqueId, name);
        }
        
        console.log(`📦 Prepared ${bulkOps.length} update operations (${skipped} skipped due to missing data)\n`);
        
        // Process in batches
        const totalBatches = Math.ceil(bulkOps.length / BATCH_SIZE);
        let batchNumber = 0;
        
        for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
            batchNumber++;
            const batch = bulkOps.slice(i, i + BATCH_SIZE);
            
            try {
                const result = await collection.bulkWrite(batch, {
                    ordered: false, // Continue processing even if some operations fail
                    bypassDocumentValidation: true // Faster, since company is a dynamic field
                });
                
                // Count successful updates
                const batchUpdated = result.modifiedCount || 0;
                updated += batchUpdated;
                
                // Calculate not found (operations that matched but didn't modify, or matchedCount - modifiedCount)
                const batchMatched = result.matchedCount || 0;
                const batchNotFound = batch.length - batchMatched;
                notFound += batchNotFound;
                
                processed += batch.length;
                
                // Progress update
                const progress = ((i + batch.length) / bulkOps.length * 100).toFixed(1);
                console.log(`✅ Batch ${batchNumber}/${totalBatches} (${progress}%): ${batchUpdated} updated, ${batchNotFound} not found`);
                
            } catch (error) {
                // If bulk write fails, try individual operations to identify problematic records
                console.error(`❌ Batch ${batchNumber} failed:`, error.message);
                
                // Fallback: process batch individually to identify errors
                for (const op of batch) {
                    const uniqueId = op.updateOne.filter.uniqueId;
                    try {
                        const result = await collection.updateOne(
                            { uniqueId: uniqueId },
                            op.updateOne.update
                        );
                        
                        if (result.matchedCount > 0) {
                            if (result.modifiedCount > 0) {
                                updated++;
                            }
                        } else {
                            notFound++;
                            notFoundIds.push(uniqueId);
                        }
                        processed++;
                    } catch (individualError) {
                        errors.push({ uniqueId, error: individualError.message });
                        processed++;
                    }
                }
            }
        }
        
        // Print summary
        console.log(`\n📊 Summary:
  Total records in CSV: ${records.length}
  Processed: ${processed}
  Updated: ${updated}
  Not found: ${notFound}
  Skipped: ${skipped}
  Errors: ${errors.length}
`);
        
        if (errors.length > 0) {
            console.log('❌ Errors encountered:');
            errors.forEach(({ uniqueId, error }) => {
                console.log(`  - uniqueId "${uniqueId}": ${error}`);
            });
        }
        
        if (notFound > 0) {
            console.log(`\n⚠️  Warning: ${notFound} uniqueIds were not found in the database.`);
            if (notFoundIds.length > 0 && notFoundIds.length <= 20) {
                console.log(`   Sample not found IDs: ${notFoundIds.slice(0, 10).join(', ')}${notFoundIds.length > 10 ? '...' : ''}`);
            }
        }
        
        console.log('\n✅ Update completed!');
        
    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close MongoDB connection
        try {
            await mongoose.connection.close();
            console.log('🔌 MongoDB connection closed');
        } catch (err) {
            console.error('Error closing connection:', err.message);
        }
    }
}

// Run the script
if (require.main === module) {
    run();
}

module.exports = { run };

