/**
 * csv-to-mongo-fast.js
 * Faster parallel CSV -> MongoDB insert with batch streaming, backpressure,
 * progress ticker (rows/s, % bytes, ETA), retries, and checkpoint resume.
 *
 * Run: node csv-to-mongo-fast.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const fs = require('fs');
const csv = require('csv-parse');
const { MongoClient } = require('mongodb');
const pLimit = require('p-limit').default;
const XLSX = require('xlsx');
const crypto = require('crypto');

// ---------------------- Config (kept same for you) ----------------------
const MONGO_URI = process.env.MONGODB_URI//"mongodb+srv://admin:Kapil%403110.@cluster0.bmbvy.mongodb.net/efilebusiness?retryWrites=true&w=majority";
const MONGO_DB = process.env.MONGO_DB//"efilebusiness";
const COLLECTION_NAME = process.env.COLLECTION_NAME//"data";
const INPUT_CSV = "files/data-23-dec.xlsx";
console.log(MONGO_URI)

// Tune these if needed (higher = faster until DB/network bottleneck)
const BATCH_SIZE = 500;       // rows per bulk write (try 2000–5000)
const CONCURRENCY = 10;        // parallel bulk writes (try 8–16)
const MAX_INFLIGHT = 20;       // pause parsing if >= this many batches running
const CHECKPOINT_FILE = 'insert_checkpoint.json';
const CHECKPOINT_FLUSH_MS = 1500;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 400;

// Stream tuning (bigger highWaterMark = fewer syscalls, better throughput)
const READSTREAM_HIGH_WM = 4 * 1024 * 1024; // 4MB

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
let lastCheckpointIndex = loadCheckpoint();
let pendingCheckpoint = null;
function saveCheckpointThrottled(index) {
    if (index <= lastCheckpointIndex) return;
    lastCheckpointIndex = index;
    if (pendingCheckpoint) return;
    pendingCheckpoint = setTimeout(() => {
        try {
            fs.writeFileSync(
                CHECKPOINT_FILE,
                JSON.stringify({ lastIndex: lastCheckpointIndex, timestamp: new Date().toISOString() }, null, 2)
            );
        } catch (err) {
            console.error('❌ Error saving checkpoint:', err.message);
        } finally {
            pendingCheckpoint = null;
        }
    }, CHECKPOINT_FLUSH_MS);
}

// ---------------------- Retry helper ----------------------
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

// ---------------------- Main ----------------------
async function run() {
    const filePath = path.resolve(INPUT_CSV);
    if (!fs.existsSync(filePath)) throw new Error(`Input CSV not found: ${filePath}`);
    const fileSize = fs.statSync(filePath).size;



    let readStream = null;
    let parser;

    let allHeaders = [];

    if (filePath.endsWith('.xlsx')) {
        console.log('📖 Detected .xlsx file, using SheetJS...');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        // Use sheet_to_json with defval: "" to ensure empty cells are empty strings, but we still need to normalize keys
        const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

        // Filter out completely empty rows
        parser = rawData.filter(row => Object.keys(row).length > 0);

        // Collect all unique keys from the first row (assuming header row is complete) or scan all
        // For safety, let's scan the first 100 rows or just use the first row if we trust it.
        // Better: get headers from the sheet directly
        const sheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const headers = [];
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
            if (cell && cell.v) headers.push(cell.v);
        }
        allHeaders = headers;

        console.log(`📊 Found ${parser.length} records in Excel file (filtered from ${rawData.length}).`);
        console.log(`🔑 Detected ${allHeaders.length} columns.`);
    } else {
        readStream = fs.createReadStream(filePath, { highWaterMark: READSTREAM_HIGH_WM });
        parser = readStream.pipe(csv.parse({ columns: true, skip_empty_lines: true }));
        // For CSV stream, we might not know all headers upfront unless we peek. 
        // But usually 'columns: true' uses the first line. 
        // We'll handle CSV headers dynamically or assume the first row dictates schema.
    }

    const client = new MongoClient(MONGO_URI, {
        maxPoolSize: 50, // allow higher parallelism
        retryWrites: true,
        serverSelectionTimeoutMS: 15000,
    });

    let currentIndex = 0;   // absolute row index
    let processed = 0;      // rows processed since resume
    let inserted = 0;       // rows inserted
    let inFlight = 0;       // running batch jobs
    let ended = false;
    let hadError = false;
    let lastTick = Date.now();
    let lastProcessedAtTick = 0;

    const limit = pLimit(CONCURRENCY);
    const batchJobs = [];
    let batch = [];

    // --------- Live progress ticker ---------
    const ticker = setInterval(() => {
        const now = Date.now();
        const dt = (now - lastTick) / 1000;
        const inc = processed - lastProcessedAtTick;
        const rps = dt > 0 ? (inc / dt) : 0;

        const bytesRead = readStream ? (readStream.bytesRead || 0) : fileSize;
        const pct = fileSize ? ((bytesRead / fileSize) * 100).toFixed(1) : '0.0';

        // ETA by bytes (rough, but cheap)
        const etaSec = fileSize && rps > 0 ? Math.max(0, ((fileSize - bytesRead) / (bytesRead / Math.max(1, processed))) / rps) : 0;

        process.stdout.write(
            `\r⏱️ ${rps.toFixed(0)} rows/s | 📦 in-flight ${inFlight}/${CONCURRENCY} | ✅ inserted ${inserted} | 🧮 processed ${processed} | 📊 ${pct}% | ⏳ ETA ~${Math.round(etaSec)}s   `
        );

        lastTick = now;
        lastProcessedAtTick = processed;
    }, 2000);

    // --------- Backpressure helpers ---------
    function maybePause() {
        if (inFlight >= MAX_INFLIGHT && readStream && !readStream.isPaused()) {
            readStream.pause();
            // console.log('\n⏸️  Paused parser (too many in-flight batches)');
        }
    }
    function maybeResume() {
        if (inFlight < Math.max(1, Math.floor(MAX_INFLIGHT * 0.7)) && readStream && readStream.isPaused()) {
            readStream.resume();
            // console.log('\n▶️  Resumed parser');
        }
    }

    // Helper to camelCase keys and clean values
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

    // Pre-compute normalized headers if we have them
    const normalizedHeaders = allHeaders.map(h => toCamelCase(h));

    // Clean and normalize values for common columns from the new dataset
    function normalizeValue(key, value) {
        if (value === undefined || value === null) return "";

        if (typeof value === "string") {
            const trimmed = value.trim();
            const lower = trimmed.toLowerCase();
            if (lower === "undefined" || lower === "unknown") return "";

            if (key === "revenue") {
                const num = parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
                return Number.isFinite(num) ? num : "";
            }

            if (key === "phoneNumber") {
                const digits = trimmed.replace(/\D+/g, "");
                return digits || "";
            }

            if (key === "sicCode") {
                const digits = trimmed.replace(/[^\d]/g, "");
                return digits || trimmed;
            }

            // Keep ZIP as a trimmed string; preserves leading zeros and suffixes
            if (key === "zip") return trimmed;

            return trimmed;
        }

        return value;
    }

    function transformRecord(record) {
        const newRecord = {};

        // If we have a master list of headers (from Excel), use that to ensure all keys exist
        // Otherwise (CSV stream), we iterate the record's keys.
        const keysToUse = normalizedHeaders.length > 0 ? normalizedHeaders : Object.keys(record).map(k => toCamelCase(k));

        // Create a map of the current record's normalized keys to values for O(1) lookup
        const recordMap = {};
        for (const [key, value] of Object.entries(record)) {
            recordMap[toCamelCase(key)] = value;
        }

        for (const key of keysToUse) {
            const value = recordMap[key];
            newRecord[key] = normalizeValue(key, value);
        }
        // 3. Generate uniqueId if missing
        if (!newRecord.uniqueId) {
            newRecord.uniqueId = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars hex
        }

        return newRecord;
    }

    async function scheduleBatchInsert(rows, endIndexExclusive, collection) {
        const docs = rows.map(r => ({ ...transformRecord(r), createdAt: new Date(), updatedAt: new Date() }));

        const job = limit(async () => {
            inFlight++;
            try {
                const res = await withRetry(
                    () => collection.bulkWrite(
                        docs.map(d => ({ insertOne: { document: d } })),
                        { ordered: false, bypassDocumentValidation: true /* fastest inserts */ }
                    ),
                    `bulkWrite(${docs.length})`
                );
                inserted += res.insertedCount || docs.length; // fallback to docs.length for older drivers
                saveCheckpointThrottled(endIndexExclusive);

                // Old-style progress line (like your previous logs)
                console.log(`\n🚚 Inserted ${docs.length} records. Total processed: ${processed} (Current index: ${endIndexExclusive})`);
            } finally {
                inFlight--;
                maybeResume();
            }
        });

        batchJobs.push(job);
        maybePause();
    }

    try {
        await client.connect();
        console.log(`\n✅ MongoDB connected`);
        const db = client.db(MONGO_DB);
        const collection = db.collection(COLLECTION_NAME);

        // Ensure unique index on uniqueId
        console.log('🏗️  Ensuring unique index on "uniqueId"...');
        await collection.createIndex({ uniqueId: 1 }, { unique: true });
        console.log('✅ Index created/verified');

        // const parser = readStream.pipe(csv.parse({ columns: true, skip_empty_lines: true })); // Moved up

        for await (const record of parser) {
            const myIndex = currentIndex++;
            if (myIndex < lastCheckpointIndex) continue;

            processed++;
            batch.push(record);

            if (batch.length >= BATCH_SIZE) {
                const toInsert = batch;
                batch = [];
                const endExclusive = myIndex + 1;
                scheduleBatchInsert(toInsert, endExclusive, collection).catch(err => {
                    hadError = true;
                    console.error('\n❌ Batch failed:', err?.message || err);
                });

                // Manual backpressure for non-stream (XLSX) sources
                if (!readStream) {
                    while (inFlight >= MAX_INFLIGHT) await sleep(50);
                }
            }
        }

        ended = true;

        if (batch.length > 0) {
            const endExclusive = currentIndex;
            scheduleBatchInsert(batch, endExclusive, collection).catch(err => {
                hadError = true;
                console.error('\n❌ Final batch failed:', err?.message || err);
            });
            batch = [];
        }

        await Promise.allSettled(batchJobs);

        // Flush last checkpoint write if pending
        if (pendingCheckpoint) {
            clearTimeout(pendingCheckpoint);
            pendingCheckpoint = null;
            try {
                fs.writeFileSync(
                    CHECKPOINT_FILE,
                    JSON.stringify({ lastIndex: lastCheckpointIndex, timestamp: new Date().toISOString() }, null, 2)
                );
            } catch (err) {
                console.error('\n❌ Error saving final checkpoint:', err.message);
            }
        }

        // If fully successful, remove checkpoint
        if (!hadError) {
            try {
                if (fs.existsSync(CHECKPOINT_FILE)) {
                    fs.unlinkSync(CHECKPOINT_FILE);
                    console.log('\n🗑️  Checkpoint file removed - insertion completed successfully');
                }
            } catch (err) {
                console.warn('\n⚠️  Could not remove checkpoint file:', err.message);
            }
        }

        clearInterval(ticker);
        console.log(`\n📊 Summary:
  File: ${filePath}
  Size: ${(fileSize / (1024 * 1024)).toFixed(1)} MB
  DB:   ${MONGO_DB}.${COLLECTION_NAME}
  BATCH_SIZE: ${BATCH_SIZE}, CONCURRENCY: ${CONCURRENCY}, MAX_INFLIGHT: ${MAX_INFLIGHT}
  Total processed: ${processed}
  Total inserted:  ${inserted}
  Final index:     ${currentIndex}
  Completed OK:    ${!hadError && ended}
`);
    } catch (error) {
        clearInterval(ticker);
        console.error('\n❌ Fatal Error:', error?.message || error);
        console.log(`💾 Checkpoint retained at index: ${lastCheckpointIndex}`);
    } finally {
        try { await client.close(); console.log('🔌 MongoDB connection closed'); } catch { }
    }
}

run();