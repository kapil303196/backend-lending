/**
 * importWithModel.js
 * Import Excel data into MongoDB using Mongoose models
 * This version uses the MCA model with proper schema validation
 * 
 * Run: node scripts/importWithModel.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const XLSX = require('xlsx');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Import the MCA model
const MCA = require('../models/MCA');

// ---------------------- Config ----------------------
const MONGO_URI = process.env.MONGODB_URI;
const INPUT_FILE = path.resolve(__dirname, "../files/data-24-nov.xlsx");
const BATCH_SIZE = 500;
const CHECKPOINT_FILE = 'import_checkpoint.json';

// ---------------------- Checkpoint ----------------------
function loadCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            const c = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
            console.log(`📍 Resuming from index: ${c.lastIndex}`);
            return c.lastIndex >>> 0;
        }
    } catch (e) {
        console.log('⚠️  Could not load checkpoint, starting from beginning');
    }
    return 0;
}

function saveCheckpoint(index) {
    try {
        fs.writeFileSync(
            CHECKPOINT_FILE,
            JSON.stringify({ lastIndex: index, timestamp: new Date().toISOString() }, null, 2)
        );
    } catch (err) {
        console.error('❌ Error saving checkpoint:', err.message);
    }
}

// Helper to camelCase keys
function toCamelCase(str) {
    return str
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .trim()
        .split(/\s+/)
        .map((word, index) =>
            index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join("");
}

function transformRecord(record, headers) {
    const newRecord = {};
    
    // Create a map of the current record's normalized keys to values
    const recordMap = {};
    for (const [key, value] of Object.entries(record)) {
        recordMap[toCamelCase(key)] = value;
    }
    
    // Normalize all headers
    const normalizedHeaders = headers.map(h => toCamelCase(h));
    
    for (const key of normalizedHeaders) {
        let value = recordMap[key];
        
        // Clean values: "Undefined", "Unknown", undefined, null -> ""
        let cleanValue = value;
        if (cleanValue === undefined || cleanValue === null) {
            cleanValue = "";
        } else if (typeof cleanValue === 'string') {
            const lower = cleanValue.toLowerCase().trim();
            if (lower === 'undefined' || lower === 'unknown') {
                cleanValue = "";
            }
        }
        newRecord[key] = cleanValue;
    }
    
    // Generate uniqueId if missing
    if (!newRecord.uniqueId) {
        newRecord.uniqueId = crypto.randomBytes(4).toString('hex').toUpperCase();
    }
    
    // Ensure isActive is set
    if (newRecord.isActive === undefined) {
        newRecord.isActive = true;
    }
    
    return newRecord;
}

async function run() {
    console.log('🚀 Starting import process...\n');
    
    if (!fs.existsSync(INPUT_FILE)) {
        throw new Error(`Input file not found: ${INPUT_FILE}`);
    }
    
    const fileSize = fs.statSync(INPUT_FILE).size;
    console.log(`📁 File: ${INPUT_FILE}`);
    console.log(`📊 Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB\n`);
    
    // Connect to MongoDB using Mongoose
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB connected via Mongoose');
        console.log(`📊 Database: ${mongoose.connection.name}\n`);
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        process.exit(1);
    }
    
    // Read Excel file
    console.log('📖 Reading Excel file...');
    const workbook = XLSX.readFile(INPUT_FILE);
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    
    // Get headers from the sheet
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const headers = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
        if (cell && cell.v) headers.push(cell.v);
    }
    
    // Filter out completely empty rows
    const parser = rawData.filter(row => Object.keys(row).length > 0);
    
    console.log(`✅ Found ${parser.length} records`);
    console.log(`🔑 Detected ${headers.length} columns\n`);
    
    const lastCheckpointIndex = loadCheckpoint();
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process in batches
    for (let i = lastCheckpointIndex; i < parser.length; i += BATCH_SIZE) {
        const batch = parser.slice(i, Math.min(i + BATCH_SIZE, parser.length));
        const docs = batch.map(record => transformRecord(record, headers));
        
        try {
            // Use insertMany with ordered: false to continue on duplicate key errors
            const result = await MCA.insertMany(docs, { 
                ordered: false,
                rawResult: true 
            });
            
            inserted += result.insertedCount || docs.length;
            processed += docs.length;
            
            console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${docs.length} records (Total: ${processed}/${parser.length})`);
            
            saveCheckpoint(i + docs.length);
        } catch (error) {
            // Handle bulk write errors (e.g., duplicate uniqueId)
            if (error.name === 'MongoBulkWriteError' || error.name === 'BulkWriteError') {
                const insertedCount = error.result?.nInserted || 0;
                const duplicateErrors = error.writeErrors?.filter(e => e.code === 11000).length || 0;
                
                inserted += insertedCount;
                skipped += duplicateErrors;
                errors += (error.writeErrors?.length || 0) - duplicateErrors;
                processed += docs.length;
                
                console.log(`⚠️  Batch ${Math.floor(i / BATCH_SIZE) + 1}: Inserted ${insertedCount}, Skipped ${duplicateErrors} duplicates, ${errors} errors`);
                
                saveCheckpoint(i + docs.length);
            } else {
                console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
                errors += docs.length;
            }
        }
        
        // Progress update
        const progress = ((processed / parser.length) * 100).toFixed(1);
        process.stdout.write(`\r📊 Progress: ${progress}% (${processed}/${parser.length})   `);
    }
    
    console.log('\n');
    
    // Remove checkpoint file if successful
    if (errors === 0 && processed === parser.length) {
        try {
            if (fs.existsSync(CHECKPOINT_FILE)) {
                fs.unlinkSync(CHECKPOINT_FILE);
                console.log('🗑️  Checkpoint file removed\n');
            }
        } catch (err) {
            console.warn('⚠️  Could not remove checkpoint file:', err.message);
        }
    }
    
    // Summary
    console.log(`\n${'='.repeat(50)}`);
    console.log('📊 IMPORT SUMMARY');
    console.log(`${'='.repeat(50)}`);
    console.log(`Total records in file: ${parser.length}`);
    console.log(`Successfully inserted: ${inserted}`);
    console.log(`Skipped (duplicates):  ${skipped}`);
    console.log(`Errors:                ${errors}`);
    console.log(`Total processed:       ${processed}`);
    console.log(`${'='.repeat(50)}\n`);
    
    // Close connection
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    console.log('✅ Import completed!\n');
}

// Run the import
run().catch(error => {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
});

