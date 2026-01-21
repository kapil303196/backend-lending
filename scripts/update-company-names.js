/**
 * update-company-names.js
 * Updates all company names to title case (first character uppercase for each word)
 * and ensures "LLC" is always uppercase regardless of original case.
 *
 * Example: "Ag foods llc" -> "Ag Foods LLC"
 *
 * Run: node update-company-names.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

// ---------------------- Config ----------------------
const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB;
const COLLECTION_NAME = process.env.COLLECTION_NAME;

// Bulk operation settings
const BATCH_SIZE = 1000;  // Number of updates per bulk write
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

console.log('MongoDB URI:', MONGO_URI ? 'Configured' : 'NOT CONFIGURED');
console.log('Database:', MONGO_DB);
console.log('Collection:', COLLECTION_NAME);

// ---------------------- Helpers ----------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt > MAX_RETRIES) {
                console.error(`❌ ${label} failed after ${MAX_RETRIES} retries:`, err?.message || err);
                throw err;
            }
            const wait = BASE_DELAY_MS * (1 << (attempt - 1)) + Math.floor(Math.random() * 200);
            console.warn(`⚠️  ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${err?.message || err}. Retrying in ${wait}ms...`);
            await sleep(wait);
        }
    }
}

/**
 * Converts a company name to title case with LLC always uppercase.
 * @param {string} name - The company name to transform
 * @returns {string} - The transformed company name
 */
function formatCompanyName(name) {
    if (!name || typeof name !== 'string') return name;
    
    // Split the name into words
    const words = name.trim().split(/\s+/);
    
    // Process each word
    const formattedWords = words.map(word => {
        // Check if word is "LLC" in any case
        if (word.toLowerCase() === 'llc') {
            return 'LLC';
        }
        
        // Title case: first letter uppercase, rest lowercase
        if (word.length === 0) return word;
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });
    
    return formattedWords.join(' ');
}

// ---------------------- Main ----------------------
async function run() {
    const client = new MongoClient(MONGO_URI, {
        maxPoolSize: 50,
        retryWrites: true,
        serverSelectionTimeoutMS: 15000,
    });

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    try {
        await client.connect();
        console.log('\n✅ MongoDB connected');
        
        const db = client.db(MONGO_DB);
        const collection = db.collection(COLLECTION_NAME);

        // Get total count for progress tracking
        const totalDocs = await collection.countDocuments({createdAt: { $gte: new Date('2026-01-20T00:00:00.000Z') }});
        console.log(`📊 Found ${totalDocs} documents with company field`);

        if (totalDocs === 0) {
            console.log('⚠️  No documents to update');
            return;
        }

        // Use cursor to iterate through documents
        const cursor = collection.find(
            {createdAt: { $gte: new Date('2026-01-20T00:00:00.000Z') }}
            // { company: { $exists: true, $ne: '' } },
            // { projection: { uniqueId: 1, company: 1 } }
        ).batchSize(BATCH_SIZE);

        let bulkOps = [];
        let lastProgressTime = Date.now();

        console.log('\n🚀 Starting company name updates...\n');

        for await (const doc of cursor) {
            totalProcessed++;
            
            const originalName = doc.company;
            const formattedName = formatCompanyName(originalName);

            // Only update if the name actually changed
            if (formattedName !== originalName) {
                bulkOps.push({
                    updateOne: {
                        filter: { uniqueId: doc.uniqueId },
                        update: { 
                            $set: { 
                                company: formattedName,
                                updatedAt: new Date()
                            } 
                        }
                    }
                });
            } else {
                totalSkipped++;
            }

            // Execute bulk operation when batch is full
            if (bulkOps.length >= BATCH_SIZE) {
                const result = await withRetry(
                    () => collection.bulkWrite(bulkOps, { ordered: false }),
                    `bulkWrite(${bulkOps.length})`
                );
                totalUpdated += result.modifiedCount || 0;
                
                console.log(`📦 Batch complete: ${bulkOps.length} ops | Modified: ${result.modifiedCount} | Progress: ${totalProcessed}/${totalDocs} (${((totalProcessed / totalDocs) * 100).toFixed(1)}%)`);
                
                bulkOps = [];
            }

            // Progress update every 5 seconds
            const now = Date.now();
            if (now - lastProgressTime > 5000) {
                const pct = ((totalProcessed / totalDocs) * 100).toFixed(1);
                process.stdout.write(`\r⏱️  Processed: ${totalProcessed}/${totalDocs} (${pct}%) | Updated: ${totalUpdated} | Skipped: ${totalSkipped}   `);
                lastProgressTime = now;
            }
        }

        // Process remaining bulk operations
        if (bulkOps.length > 0) {
            const result = await withRetry(
                () => collection.bulkWrite(bulkOps, { ordered: false }),
                `bulkWrite(${bulkOps.length})`
            );
            totalUpdated += result.modifiedCount || 0;
            console.log(`\n📦 Final batch: ${bulkOps.length} ops | Modified: ${result.modifiedCount}`);
        }

        console.log(`\n
╔════════════════════════════════════════════════════╗
║               UPDATE COMPLETE                       ║
╠════════════════════════════════════════════════════╣
║  Database:        ${MONGO_DB.padEnd(30)}  ║
║  Collection:      ${COLLECTION_NAME.padEnd(30)}  ║
╠════════════════════════════════════════════════════╣
║  Total Processed: ${String(totalProcessed).padEnd(30)}  ║
║  Total Updated:   ${String(totalUpdated).padEnd(30)}  ║
║  Total Skipped:   ${String(totalSkipped).padEnd(30)}  ║
║  (no change needed)                                 ║
╚════════════════════════════════════════════════════╝
`);

    } catch (error) {
        console.error('\n❌ Fatal Error:', error?.message || error);
        totalErrors++;
    } finally {
        try { 
            await client.close(); 
            console.log('🔌 MongoDB connection closed'); 
        } catch { }
    }
}

// ---------------------- Test the formatter ----------------------
function testFormatter() {
    const testCases = [
        { input: 'Ag foods llc', expected: 'Ag Foods LLC' },
        { input: 'ACME CORPORATION LLC', expected: 'Acme Corporation LLC' },
        { input: 'best buy Llc', expected: 'Best Buy LLC' },
        { input: 'THE COMPANY LLC', expected: 'The Company LLC' },
        { input: 'simple company', expected: 'Simple Company' },
        { input: 'LLC only', expected: 'LLC Only' },
        { input: 'already Correct LLC', expected: 'Already Correct LLC' },
    ];

    console.log('\n🧪 Testing company name formatter:\n');
    let allPassed = true;
    
    for (const { input, expected } of testCases) {
        const result = formatCompanyName(input);
        const passed = result === expected;
        const status = passed ? '✅' : '❌';
        console.log(`${status} "${input}" -> "${result}" ${passed ? '' : `(expected: "${expected}")`}`);
        if (!passed) allPassed = false;
    }
    
    console.log(allPassed ? '\n✅ All tests passed!\n' : '\n❌ Some tests failed!\n');
    return allPassed;
}

// Check command line args for test mode
if (process.argv.includes('--test')) {
    testFormatter();
} else {
    // Run tests first, then proceed if they pass
    if (testFormatter()) {
        run();
    } else {
        console.error('❌ Tests failed. Fix the formatter before running.');
        process.exit(1);
    }
}
