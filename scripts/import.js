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
const INPUT_CSV = path.resolve(__dirname, "../files/Washington local emails combine.csv");
console.log(MONGO_URI)

// =====================================================================
// HEADER MAPPING CONFIGURATION
// =====================================================================
// Add your CSV/Excel header names here and map them to MongoDB field names.
// The keys are the CSV column headers (case-insensitive, whitespace-trimmed).
// The values are the MongoDB document field names.
//
// Example: If your CSV has "Phone number" column, map it to "phoneNumber"
// =====================================================================
const HEADER_MAPPING = {
    // ----------------------
    // Washington local emails combine.csv (explicit column support)
    // ----------------------
    'entity id': 'entityId',
    'entityid': 'entityId',
    'physical address line 1': 'physicalAddressLine1',
    'physical address line 2': 'physicalAddressLine2',
    'physical address line 3': 'physicalAddressLine3',
    'physical city': 'physicalCity',
    'physical state': 'physicalState',
    'physical country': 'physicalCountry',
    'physical zip5': 'physicalZip5',
    'physical zip4': 'physicalZip4',
    'mailing address line 1': 'mailingAddressLine1',
    'mailing address line 2': 'mailingAddressLine2',
    'mailing address line 3': 'mailingAddressLine3',
    // NOTE: the source file header has a double-space: "Mailing  City"
    'mailing  city': 'mailingCity',
    'mailing city': 'mailingCity',
    'mailing state': 'mailingState',
    'mailing country': 'mailingCountry',
    'mailing zip5': 'mailingZip5',
    // NOTE: source file typo: "Mailig Zip4"
    'mailig zip4': 'mailingZip4',
    'mailing zip4': 'mailingZip4',
    'business name': 'businessName',
    'record status': 'recordStatus',
    'state of incorporation': 'stateOfIncorporation',
    'date of incorporation': 'dateOfIncorporation',
    'expiration date': 'expirationDate',
    'dissolution date': 'dissolutionDate',
    'type': 'type',
    'type description': 'typeDescription',
    'registered agent name': 'registeredAgentName',
    'registered agent address': 'registeredAgentAddress',
    'registered agent city': 'registeredAgentCity',
    'registered agent state': 'registeredAgentState',
    'registered agent zip': 'registeredAgentZip',

    // Phone fields
    'phone number': 'phoneNumber',
    'phonenumber': 'phoneNumber',
    'phone': 'phoneNumber',
    'business phone': 'phoneNumber',
    'businessphone': 'phoneNumber',
    
    // Line type / number type
    'line type': 'numbertype',
    'linetype': 'numbertype',
    'number type': 'numbertype',
    'numbertype': 'numbertype',
    
    // Network type / carrier
    'networktype': 'networktype',
    'network type': 'networktype',
    'carrier': 'networktype',
    
    // Name fields
    'first name': 'firstName',
    'firstname': 'firstName',
    'fname': 'firstName',
    'last name': 'lastName',
    'lastname': 'lastName',
    'lname': 'lastName',
    'middle name': 'middleName',
    'middlename': 'middleName',
    'mname': 'middleName',
    
    // Company / Business name
    'company': 'company',
    'name': 'company',
    'businessname': 'businessName',
    'company name': 'company',
    'companyname': 'company',
    
    // Revenue
    'revenue': 'monthlyRevenue',
    'monthly revenue': 'monthlyRevenue',
    'monthlyrevenue': 'monthlyRevenue',
    'annual revenue': 'monthlyRevenue',
    
    // Email
    'email': 'email',
    'email address': 'email',
    'emailaddress': 'email',
    
    // Address fields
    'address': 'address',
    'street': 'address',
    'street address': 'address',
    'physicaladdressline1': 'address',
    'mailingaddressline1': 'mailingAddress',
    'city': 'city',
    'physicalcity': 'city',
    'mailingcity': 'mailingCity',
    'state': 'state',
    'physicalstate': 'state',
    'mailingstate': 'mailingState',
    'zip': 'zip',
    'zipcode': 'zip',
    'zip code': 'zip',
    'postal code': 'zip',
    'physicalzip5': 'zip',
    'physicalzip4': 'zip4',
    'mailingzip5': 'mailingZip',
    'mailingzip4': 'mailingZip4',
    'physicalcountry': 'country',
    'mailingcountry': 'mailingCountry',
    
    // Washington State specific fields
    'ubi': 'ubi',
    'category': 'category',
    'stateofincorporation': 'stateOfIncorporation',
    // Keep legacy support for alternate header formatting without overriding the main mapping above.
    'recordstatus': 'recordStatus',
    'dateofincorporation': 'dateOfIncorporation',
    'expirationdate': 'expirationDate',
    'dissolutiondate': 'dissolutionDate',
    'duration': 'duration',
    'typedescription': 'typeDescription',
    'registeredagentname': 'registeredAgentName',
    'registeredagentaddress': 'registeredAgentAddress',
    'registeredagentcity': 'registeredAgentCity',
    'registeredagentstate': 'registeredAgentState',
    'registeredagentzip': 'registeredAgentZip',
    
    // Other fields
    'uniqueid': 'uniqueId',
    'unique id': 'uniqueId',
    'id': 'uniqueId',
    'taxid': 'taxId',
    'tax id': 'taxId',
    'ein': 'taxId',
    'birthdate': 'birthDate',
    'birth date': 'birthDate',
    'dob': 'birthDate',
    'datebusinessstarted': 'dateBusinessStarted',
    'date business started': 'dateBusinessStarted',
    'business start date': 'dateBusinessStarted',
    'time in business': 'dateBusinessStarted',
    'timeinbusiness': 'dateBusinessStarted',
    'siccode': 'sicCode',
    'sic code': 'sicCode',
    'sic': 'sicCode',
    'emailstatus': 'emailStatus',
    'email status': 'emailStatus',
    'title': 'title',
    'job title': 'title',
    'status': 'status',
    'url': 'url',
    'website': 'url',
};

// MongoDB document schema - all fields that will be created
const MONGO_SCHEMA_FIELDS = {
    phoneNumber: "",
    numbertype: "",
    networktype: "",
    firstName: "",
    middleName: "",
    lastName: "",
    company: "",
    email: "",
    phone2: "",
    phone3: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    zip4: "",
    country: "",
    // General mailing fields (legacy)
    mailingAddress: "",
    mailingCity: "",
    mailingState: "",
    mailingZip: "",
    mailingZip4: "",
    mailingCountry: "",
    // Explicit WA columns
    url: "",
    entityId: "",
    physicalAddressLine1: "",
    physicalAddressLine2: "",
    physicalAddressLine3: "",
    physicalCity: "",
    physicalState: "",
    physicalCountry: "",
    physicalZip5: "",
    physicalZip4: "",
    mailingAddressLine1: "",
    mailingAddressLine2: "",
    mailingAddressLine3: "",
    mailingZip5: "",
    businessName: "",
    recordStatus: "",
    taxId: "",
    birthDate: "",
    dateBusinessStarted: "",
    dateOfIncorporation: "",
    monthlyRevenue: "",
    uniqueId: "",
    title: "",
    status: "",
    // Washington State specific fields
    ubi: "",
    category: "",
    stateOfIncorporation: "",
    expirationDate: "",
    dissolutionDate: "",
    duration: "",
    typeDescription: "",
    registeredAgentName: "",
    registeredAgentAddress: "",
    registeredAgentCity: "",
    registeredAgentState: "",
    registeredAgentZip: "",
    isActive: true
};

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
            // Do NOT retry duplicate key errors; we handle duplicates via update/upsert.
            const code = err?.code ?? err?.errorResponse?.code;
            if (code === 11000) throw err;
            // BulkWrite can contain duplicate key writeErrors
            const writeErrors = err?.writeErrors || err?.result?.writeErrors;
            if (Array.isArray(writeErrors) && writeErrors.some(e => e?.code === 11000)) throw err;

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
        console.log('📏 File size: ' + (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2) + ' MB');
        console.log('⚠️  Large file detected, using optimized read options...');
        
        // For very large files, read as buffer first for better memory handling
        console.log('📖 Reading file buffer...');
        const fileBuffer = fs.readFileSync(filePath);
        console.log('📖 Parsing workbook from buffer...');
        
        // For large files, use minimal options and read only what we need
        const workbook = XLSX.read(fileBuffer, { 
            type: 'buffer',
            cellStyles: false,
            cellHTML: false,
            cellFormula: false,
            cellNF: false,
            cellDates: true,
            sheetStubs: false,
            bookDeps: false,
            bookFiles: false,
            bookProps: false,
            bookVBA: false,
            dense: false,
            WTF: false
        });
        
        // Check if workbook has sheets
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Excel file has no sheets');
        }
        
        console.log('📋 Available sheets:', workbook.SheetNames);
        console.log('📦 Sheets object exists:', !!workbook.Sheets);
        console.log('📦 Sheets object keys:', Object.keys(workbook.Sheets || {}));
        
        const sheetName = workbook.SheetNames[0];
        console.log(`📄 Attempting to read sheet: "${sheetName}"`);
        
        // Try to access the sheet
        let sheet = workbook.Sheets[sheetName];
        
        // If sheet doesn't exist, try iterating over all available keys
        if (!sheet) {
            console.log('⚠️  Direct access failed, trying alternative access methods...');
            
            // Try case-insensitive lookup
            const sheetsObj = workbook.Sheets || {};
            const availableKeys = Object.keys(sheetsObj);
            console.log('Available sheet keys:', availableKeys);
            
            for (const key of availableKeys) {
                if (key.toLowerCase() === sheetName.toLowerCase()) {
                    sheet = sheetsObj[key];
                    console.log(`✅ Found sheet with key: "${key}"`);
                    break;
                }
            }
        }
        
        if (!sheet) {
            console.error('❌ Sheet not found after all attempts.');
            console.error('❌ SheetNames:', workbook.SheetNames);
            console.error('❌ Available Sheets keys:', Object.keys(workbook.Sheets || {}));
            
            // Try to re-read the file with different options (no optimizations)
            console.log('🔄 Attempting to re-read file with default options...');
            const wb2 = XLSX.read(fileBuffer, { type: 'buffer' });
            console.log('📋 Re-read SheetNames:', wb2.SheetNames);
            console.log('📦 Re-read Sheets keys:', Object.keys(wb2.Sheets || {}));
            
            // If the re-read worked, use that workbook instead
            if (wb2.Sheets && Object.keys(wb2.Sheets).length > 0) {
                console.log('✅ Re-read successful, using this workbook');
                const retrySheet = wb2.Sheets[sheetName] || wb2.Sheets[Object.keys(wb2.Sheets)[0]];
                if (retrySheet) {
                    console.log('✅ Sheet loaded on retry');
                    // Convert and continue
                    const rawData = XLSX.utils.sheet_to_json(retrySheet, { defval: "", raw: false });
                    
                    function isRowEmpty(row) {
                        if (!row || typeof row !== 'object' || Object.keys(row).length === 0) return true;
                        const values = Object.values(row);
                        return values.every(val => {
                            if (val === null || val === undefined) return true;
                            if (typeof val === 'string' && val.trim() === '') return true;
                            return false;
                        });
                    }
                    
                    parser = rawData.filter(row => !isRowEmpty(row));
                    
                    const range = XLSX.utils.decode_range(retrySheet['!ref']);
                    const headers = [];
                    for (let C = range.s.c; C <= range.e.c; ++C) {
                        const cell = retrySheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
                        if (cell && cell.v) headers.push(cell.v);
                    }
                    allHeaders = headers;
                    
                    console.log(`✅ Loaded ${parser.length} rows from Excel (retry)`);
                    console.log('📊 Sample headers:', allHeaders.slice(0, 5));
                    // Skip the error throw and continue
                    sheet = retrySheet;
                }
            }
            
            // Only throw if retry also failed
            if (!sheet) {
                throw new Error(`Sheet "${sheetName}" not found in workbook`);
            }
        }
        
        // Check if sheet has data
        if (!sheet['!ref']) {
            throw new Error(`Sheet "${sheetName}" appears to be empty (no cell range)`);
        }
        
        // Only process if not already processed by retry
        if (!parser || parser.length === 0) {
            console.log('✅ Sheet loaded successfully, converting to JSON...');
            // Use sheet_to_json with defval: "" to ensure empty cells are empty strings, but we still need to normalize keys
            const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

            // Helper to check if a row is empty (all values are empty/whitespace)
            function isRowEmpty(row) {
                if (!row || typeof row !== 'object' || Object.keys(row).length === 0) return true;
                const values = Object.values(row);
                return values.every(val => {
                    if (val === null || val === undefined) return true;
                    if (typeof val === 'string' && val.trim() === '') return true;
                    return false;
                });
            }

            // Filter out completely empty rows
            parser = rawData.filter(row => !isRowEmpty(row));

            // Collect all unique keys from the first row (assuming header row is complete) or scan all
            // For safety, let's scan the first 100 rows or just use the first row if we trust it.
            // Better: get headers from the sheet directly
            const range = XLSX.utils.decode_range(sheet['!ref']);
            const headers = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: C })];
                if (cell && cell.v) headers.push(cell.v);
            }
            allHeaders = headers;

            console.log(`📊 Found ${parser.length} records in Excel file (filtered from ${rawData.length}).`);
        }
        console.log(`🔑 Detected ${allHeaders.length} columns.`);
    } else {
        console.log('📖 Detected CSV file, extracting headers...');
        // For CSV, we need to read the first line to get headers
        // Read first line synchronously to get headers
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) {
            throw new Error('CSV file is empty');
        }
        
        // Parse first line as headers (handle tab or comma delimited)
        const firstLine = lines[0];
        const delimiter = firstLine.includes('\t') ? '\t' : ',';
        
        // Simple CSV header parser that handles quoted values
        function parseCSVLine(line, delim) {
            const result = [];
            let current = '';
            let inQuotes = false;
            let quoteChar = null;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const nextChar = line[i + 1];
                
                if ((char === '"' || char === "'") && !inQuotes) {
                    inQuotes = true;
                    quoteChar = char;
                } else if (char === quoteChar && inQuotes) {
                    if (nextChar === quoteChar) {
                        // Escaped quote
                        current += char;
                        i++; // Skip next quote
                    } else if (nextChar === delim || nextChar === undefined || nextChar === '\r' || nextChar === '\n') {
                        // End of quoted field
                        inQuotes = false;
                        quoteChar = null;
                    } else {
                        current += char;
                    }
                } else if (char === delim && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }
        
        allHeaders = parseCSVLine(firstLine, delimiter);
        
        // Clean up headers (remove quotes, trim whitespace)
        allHeaders = allHeaders.map(h => {
            const str = String(h || '').trim();
            // Remove surrounding quotes if present
            return str.replace(/^["']|["']$/g, '');
        });
        
        console.log(`🔑 Detected ${allHeaders.length} columns from CSV header.`);
        console.log(`📋 Headers: ${allHeaders.slice(0, 5).join(', ')}${allHeaders.length > 5 ? '...' : ''}`);
        
        // Create stream parser with the detected delimiter
        readStream = fs.createReadStream(filePath, { highWaterMark: READSTREAM_HIGH_WM });
        parser = readStream.pipe(csv.parse({ 
            columns: true, 
            skip_empty_lines: true,
            delimiter: delimiter,
            relax_column_count: true
        }));
    }

    const client = new MongoClient(MONGO_URI, {
        maxPoolSize: 50, // allow higher parallelism
        retryWrites: true,
        serverSelectionTimeoutMS: 15000,
    });

    let currentIndex = 0;   // absolute row index
    let processed = 0;      // rows processed since resume
    let upserted = 0;       // new docs created
    let modified = 0;       // existing docs updated
    let skipped = 0;        // rows skipped (empty)
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
            `\r⏱️ ${rps.toFixed(0)} rows/s | 📦 in-flight ${inFlight}/${CONCURRENCY} | 🆕 upserted ${upserted} | 🔁 updated ${modified} | 🧮 processed ${processed} | ⏭️  skipped ${skipped} | 📊 ${pct}% | ⏳ ETA ~${Math.round(etaSec)}s   `
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

    // Helper to check if a record is empty (all values are empty/whitespace)
    function isRecordEmpty(record) {
        if (!record || typeof record !== 'object') return true;
        const values = Object.values(record);
        if (values.length === 0) return true;
        // Check if all values are empty, null, undefined, or whitespace
        return values.every(val => {
            if (val === null || val === undefined) return true;
            if (typeof val === 'string' && val.trim() === '') return true;
            return false;
        });
    }

    // Helper to normalize CSV header names to lowercase for matching
    function normalizeHeader(str) {
        return str
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .trim()
            .toLowerCase();
    }

    // Mapping from CSV headers to MongoDB document keys
    // Uses the HEADER_MAPPING configuration defined at the top of the file
    function getMongoKey(csvHeader) {
        if (!csvHeader) return null;
        
        // Trim the header first to handle any whitespace
        const trimmed = csvHeader.toString().trim();
        
        // Remove any BOM or zero-width characters
        const cleaned = trimmed.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        
        // Normalize to lowercase for lookup
        const normalized = normalizeHeader(cleaned);
        
        // Look up in the configurable HEADER_MAPPING
        if (HEADER_MAPPING[normalized]) {
            return HEADER_MAPPING[normalized];
        }
        
        // Also try the cleaned version directly (for exact case matches)
        const lowerCleaned = cleaned.toLowerCase();
        if (HEADER_MAPPING[lowerCleaned]) {
            return HEADER_MAPPING[lowerCleaned];
        }
        
        return null;
    }

    // Clean and normalize values
    function normalizeValue(mongoKey, value) {
        if (value === undefined || value === null) return "";

        if (typeof value === "string") {
            const trimmed = value.trim();
            const lower = trimmed.toLowerCase();
            if (lower === "undefined" || lower === "unknown" || lower === "null" || lower === "") return "";

            if (mongoKey === "monthlyRevenue") {
                const num = parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
                return Number.isFinite(num) ? num : "";
            }

            if (mongoKey === "phoneNumber") {
                const digits = trimmed.replace(/\D+/g, "");
                return digits || "";
            }

            if (mongoKey === "zip") return trimmed;

            if (mongoKey === "email") {
                const emailLower = trimmed.toLowerCase();
                if (emailLower && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
                    return emailLower;
                }
                return trimmed;
            }

            return trimmed;
        }

        return value;
    }

    let firstRecordLogged = false;
    function transformRecord(record) {
        // Initialize with all required MongoDB document fields from schema config
        const newRecord = { ...MONGO_SCHEMA_FIELDS };

        // Log CSV keys from first record for debugging
        const isFirstRecord = !firstRecordLogged;
        if (isFirstRecord) {
            console.log('\n🔍 CSV Record keys:', Object.keys(record));
        }

        // Map CSV record fields to MongoDB document structure
        for (const [csvKey, value] of Object.entries(record)) {
            const mongoKey = getMongoKey(csvKey);
            if (mongoKey) {
                const normalizedValue = normalizeValue(mongoKey, value);
                newRecord[mongoKey] = normalizedValue;
                if (isFirstRecord) {
                    console.log(`✅ Mapped "${csvKey}" → "${mongoKey}" = "${normalizedValue}"`);
                }
            } else if (isFirstRecord) {
                // Log unmapped keys for debugging (only first time)
                console.log(`⚠️  Unmapped CSV key: "${csvKey}" = "${value}"`);
            }
        }
        
        // Set flag after processing first record
        if (isFirstRecord) {
            firstRecordLogged = true;
        }

        // Generate uniqueId if missing
        if (!newRecord.uniqueId || newRecord.uniqueId === "") {
            // Use UBI as uniqueId if available (Washington State businesses)
            if (newRecord.ubi && newRecord.ubi !== "") {
                newRecord.uniqueId = newRecord.ubi;
            } else if (newRecord.entityId && newRecord.entityId !== "") {
                newRecord.uniqueId = String(newRecord.entityId).trim();
            } else {
                newRecord.uniqueId = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars hex
            }
        }

        // If UBI missing but Entity ID present (your WA file uses "Entity ID"), keep both aligned
        if ((!newRecord.ubi || newRecord.ubi === "") && newRecord.entityId && newRecord.entityId !== "") {
            newRecord.ubi = String(newRecord.entityId).trim();
        }

        // Derive isActive from Record Status when present
        if (newRecord.recordStatus && typeof newRecord.recordStatus === 'string') {
            newRecord.isActive = newRecord.recordStatus.trim().toLowerCase() === 'active';
        } else if (newRecord.status && typeof newRecord.status === 'string') {
            // fallback to legacy "status" field
            newRecord.isActive = newRecord.status.trim().toLowerCase() === 'active';
        }

        return newRecord;
    }

    async function scheduleBatchInsert(rows, endIndexExclusive, collection) {
        // NOTE: We update existing docs by uniqueId (no new doc for duplicates).
        // Upsert=true keeps the import idempotent (creates doc if not present).
        const now = new Date();
        const docs = rows.map(r => ({ ...transformRecord(r), updatedAt: now }));

        const job = limit(async () => {
            inFlight++;
            try {
                const res = await withRetry(
                    () => collection.bulkWrite(
                        docs.map(d => ({
                            updateOne: {
                                filter: { uniqueId: d.uniqueId },
                                update: {
                                    $set: d,
                                    $setOnInsert: { createdAt: now }
                                },
                                upsert: true
                            }
                        })),
                        { ordered: false, bypassDocumentValidation: true /* fastest inserts */ }
                    ),
                    `bulkWrite(${docs.length})`
                );
                upserted += res.upsertedCount || 0;
                // modifiedCount doesn't include upserts; it's only existing docs changed
                modified += res.modifiedCount || 0;
                saveCheckpointThrottled(endIndexExclusive);

                // Old-style progress line (like your previous logs)
                console.log(`\n🚚 Upserted ${res.upsertedCount || 0} | Updated ${res.modifiedCount || 0} records. Total processed: ${processed} (Current index: ${endIndexExclusive})`);
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

            // Skip empty rows
            if (isRecordEmpty(record)) {
                skipped++;
                continue;
            }

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
  Total upserted:  ${upserted}
  Total updated:   ${modified}
  Total skipped:   ${skipped}
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