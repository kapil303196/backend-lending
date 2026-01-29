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

// ---------------------- Main query (global) ----------------------
// Keep this at the top so it's easy to change in one place.
const MAIN_QUERY = {
    createdAt: { $gte: new Date('2026-01-28T00:00:00.000Z') },
    company: { $exists: true, $type: 'string', $ne: '' },
};

// Bulk operation settings
// Separate read vs write batch sizes to maximize throughput.
const READ_BATCH_SIZE = 5000;   // Cursor batch size (docs fetched per round-trip)
const WRITE_BATCH_SIZE = 1000;  // Number of updates per bulkWrite
// Parallel bulk writes (like import.js)
const MAX_INFLIGHT_BULKS = 10;  // how many bulkWrite batches can run at once
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

// Only fetch what we need.
const PROJECTION = { uniqueId: 1, company: 1 };

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

    // Sanitize: remove quotes, commas, and other special characters.
    // Keep letters/numbers/spaces/hyphens, collapse whitespace.
    let sanitized = name
        .normalize('NFKD')
        // Remove common quote characters (straight + smart quotes)
        .replace(/["“”‘’]/g, '')
        // Remove commas explicitly (common in "Company, LLC" patterns)
        .replace(/,/g, '')
        // Remove any remaining special characters (keep letters/numbers/spaces/hyphens)
        .replace(/[^A-Za-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    // Split the name into words
    const words = sanitized.split(/\s+/);
    
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
        const totalDocs = await collection.countDocuments(MAIN_QUERY);
        console.log(`📊 Found ${totalDocs} documents with company field`);

        if (totalDocs === 0) {
            console.log('⚠️  No documents to update');
            return;
        }

        // Use cursor to iterate through documents
        const cursor = collection
            .find(MAIN_QUERY, { projection: PROJECTION })
            .batchSize(READ_BATCH_SIZE);

        let bulkOps = [];
        let lastProgressTime = Date.now();
        const inFlight = new Set(); // track running bulkWrite promises

        console.log('\n🚀 Starting company name updates...\n');

        async function scheduleBulkWrite(ops) {
            if (!ops || ops.length === 0) return;

            // Backpressure: don't let in-flight bulks grow without bound
            while (inFlight.size >= MAX_INFLIGHT_BULKS) {
                await Promise.race(Array.from(inFlight));
            }

            const startedAt = Date.now();
            const job = (async () => {
                try {
                    const result = await withRetry(
                        () => collection.bulkWrite(ops, { ordered: false }),
                        `bulkWrite(${ops.length})`
                    );
                    totalUpdated += result.modifiedCount || 0;

                    const pct = ((totalProcessed / totalDocs) * 100).toFixed(1);
                    console.log(
                        `📦 Batch complete: ${ops.length} ops | Modified: ${result.modifiedCount || 0} | In-flight: ${inFlight.size}/${MAX_INFLIGHT_BULKS} | Progress: ${totalProcessed}/${totalDocs} (${pct}%) | ${(Date.now() - startedAt)}ms`
                    );
                } catch (err) {
                    totalErrors++;
                    console.error(`\n❌ Batch failed (${ops.length} ops):`, err?.message || err);
                    throw err;
                }
            })();

            inFlight.add(job);
            job.finally(() => inFlight.delete(job));
        }

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
            if (bulkOps.length >= WRITE_BATCH_SIZE) {
                const opsToWrite = bulkOps;
                bulkOps = [];
                // Fire-and-forget (bounded by MAX_INFLIGHT_BULKS); we'll await drain later.
                scheduleBulkWrite(opsToWrite).catch(() => {});
            }

            // Progress update every 5 seconds
            const now = Date.now();
            if (now - lastProgressTime > 5000) {
                const pct = ((totalProcessed / totalDocs) * 100).toFixed(1);
                process.stdout.write(`\r⏱️  Processed: ${totalProcessed}/${totalDocs} (${pct}%) | Updated: ${totalUpdated} | Skipped: ${totalSkipped} | In-flight: ${inFlight.size}/${MAX_INFLIGHT_BULKS}   `);
                lastProgressTime = now;
            }
        }

        // Process remaining bulk operations
        if (bulkOps.length > 0) {
            await scheduleBulkWrite(bulkOps);
            bulkOps = [];
        }

        // Drain all in-flight bulk writes
        if (inFlight.size > 0) {
            await Promise.allSettled(Array.from(inFlight));
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
║  Total Errors:    ${String(totalErrors).padEnd(30)}  ║
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
        { input: '"Green Acres Custom Ag," LLC"', expected: 'Green Acres Custom Ag LLC' },
        { input: 'Green Acres Custom Ag, LLC', expected: 'Green Acres Custom Ag LLC' },
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
