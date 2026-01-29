/**
 * update-address-from-physical-mailing.js
 * High-performance bulk update for millions of records
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
const MONGO_DB = process.env.MONGO_DB;
const COLLECTION_NAME = process.env.COLLECTION_NAME;

// Performance tuning
const BATCH_SIZE = 5000;           // Process 5k docs at a time
const PARALLEL_BATCHES = 10;       // Run 10 batches in parallel
const MAX_RETRIES = 3;

console.log('MongoDB URI:', MONGO_URI ? 'Configured' : 'NOT CONFIGURED');
console.log('Database:', MONGO_DB);
console.log('Collection:', COLLECTION_NAME);
console.log('Batch Size:', BATCH_SIZE);
console.log('Parallel Batches:', PARALLEL_BATCHES);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to pick first non-empty value
function pickFirst(...values) {
    for (const val of values) {
        if (val && val !== '' && val !== '0') {
            return val;
        }
    }
    return '';
}

// Process a single batch
async function processBatch(collection, docs, batchNum) {
    const bulkOps = [];
    
    for (const doc of docs) {
        const updates = {};
        let hasUpdate = false;

        // Address
        if (!doc.address || doc.address === '') {
            updates.address = pickFirst(doc.physicalAddressLine1, doc.mailingAddressLine1);
            if (updates.address) hasUpdate = true;
        }

        // City
        if (!doc.city || doc.city === '') {
            updates.city = pickFirst(doc.physicalCity, doc.mailingCity);
            if (updates.city) hasUpdate = true;
        }

        // State
        if (!doc.state || doc.state === '') {
            updates.state = pickFirst(doc.physicalState, doc.mailingState);
            if (updates.state) hasUpdate = true;
        }

        // Zip
        if (!doc.zip || doc.zip === '' || doc.zip === '0') {
            updates.zip = pickFirst(doc.physicalZip5, doc.mailingZip5);
            if (updates.zip) hasUpdate = true;
        }

        // Only update if we have changes
        if (hasUpdate) {
            updates.updatedAt = new Date();
            bulkOps.push({
                updateOne: {
                    filter: { _id: doc._id },
                    update: { $set: updates }
                }
            });
        }
    }

    if (bulkOps.length === 0) {
        return { matched: 0, modified: 0 };
    }

    // Execute bulk write with retry
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const result = await collection.bulkWrite(bulkOps, { ordered: false });
            return {
                matched: result.matchedCount || 0,
                modified: result.modifiedCount || 0
            };
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                console.error(`❌ Batch ${batchNum} failed after ${MAX_RETRIES} attempts:`, error.message);
                throw error;
            }
            const delay = 1000 * attempt;
            console.warn(`⚠️  Batch ${batchNum} attempt ${attempt} failed, retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

async function run() {
    const client = new MongoClient(MONGO_URI, {
        maxPoolSize: 100,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
    });

    try {
        await client.connect();
        console.log('\n✅ MongoDB connected\n');

        const db = client.db(MONGO_DB);
        const collection = db.collection(COLLECTION_NAME);

        // Query for documents needing updates
        const query = {
            company: { $exists: true, $type: 'string', $ne: '' },
            $or: [
                { address: { $in: ['', null] } },
                { city: { $in: ['', null] } },
                { state: { $in: ['', null] } },
                { zip: { $in: ['', '0', null] } },
            ],
        };

        const totalDocs = await collection.countDocuments(query);
        console.log(`📊 Found ${totalDocs.toLocaleString()} documents needing address backfill`);

        if (totalDocs === 0) {
            console.log('⚠️  No documents to update.');
            return;
        }

        console.log(`⚙️  Estimated batches: ${Math.ceil(totalDocs / BATCH_SIZE)}`);
        console.log(`🚀 Starting parallel processing with ${PARALLEL_BATCHES} workers...\n`);

        const startTime = Date.now();
        let totalProcessed = 0;
        let totalMatched = 0;
        let totalModified = 0;
        let batchNum = 0;

        // Fetch only fields we need
        const projection = {
            _id: 1,
            address: 1, city: 1, state: 1, zip: 1,
            physicalAddressLine1: 1, physicalCity: 1, physicalState: 1, physicalZip5: 1,
            mailingAddressLine1: 1, mailingCity: 1, mailingState: 1, mailingZip5: 1,
        };

        const cursor = collection.find(query, { projection }).batchSize(BATCH_SIZE);

        let currentBatch = [];
        const activeBatches = [];

        for await (const doc of cursor) {
            currentBatch.push(doc);

            if (currentBatch.length >= BATCH_SIZE) {
                batchNum++;
                const batch = currentBatch;
                const thisBatchNum = batchNum;
                
                // Start batch processing
                const batchPromise = processBatch(collection, batch, thisBatchNum)
                    .then(result => {
                        totalMatched += result.matched;
                        totalModified += result.modified;
                        totalProcessed += batch.length;
                        
                        const progress = ((totalProcessed / totalDocs) * 100).toFixed(1);
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        const rate = Math.round(totalProcessed / parseFloat(elapsed || '1'));
                        
                        console.log(
                            `✓ Batch ${thisBatchNum}: ${batch.length} docs | ` +
                            `Modified: ${result.modified} | ` +
                            `Progress: ${progress}% | ` +
                            `Rate: ${rate}/sec`
                        );
                    });

                activeBatches.push(batchPromise);
                currentBatch = [];

                // Wait if we have too many parallel batches
                if (activeBatches.length >= PARALLEL_BATCHES) {
                    await Promise.race(activeBatches);
                    // Remove completed promises
                    for (let i = activeBatches.length - 1; i >= 0; i--) {
                        if (await Promise.race([activeBatches[i].then(() => true), Promise.resolve(false)])) {
                            activeBatches.splice(i, 1);
                        }
                    }
                }
            }
        }

        // Process remaining documents
        if (currentBatch.length > 0) {
            batchNum++;
            const result = await processBatch(collection, currentBatch, batchNum);
            totalMatched += result.matched;
            totalModified += result.modified;
            totalProcessed += currentBatch.length;
        }

        // Wait for all remaining batches
        await Promise.all(activeBatches);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const avgRate = Math.round(totalProcessed / parseFloat(duration));

        console.log(`
╔════════════════════════════════════════════════════╗
║            ADDRESS BACKFILL COMPLETE               ║
╠════════════════════════════════════════════════════╣
║  Total Processed:  ${String(totalProcessed.toLocaleString()).padEnd(29)} ║
║  Total Matched:    ${String(totalMatched.toLocaleString()).padEnd(29)} ║
║  Total Modified:   ${String(totalModified.toLocaleString()).padEnd(29)} ║
║  Duration:         ${String(duration + 's').padEnd(29)} ║
║  Avg Rate:         ${String(avgRate + ' docs/sec').padEnd(29)} ║
╚════════════════════════════════════════════════════╝
`);

        // Show sample
        console.log('📄 Sample updated document:');
        const sample = await collection.findOne(
            { 
                updatedAt: { $gte: new Date(Date.now() - 10000) },
                address: { $ne: '' }
            },
            { 
                projection: { 
                    firstName: 1, lastName: 1, 
                    address: 1, city: 1, state: 1, zip: 1 
                }
            }
        );
        if (sample) {
            console.log(JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error('\n❌ Fatal Error:', error.message);
        console.error(error.stack);
    } finally {
        await client.close();
        console.log('\n🔌 MongoDB connection closed');
    }
}

run();