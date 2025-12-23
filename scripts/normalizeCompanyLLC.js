/**
 * Normalize all occurrences of "llc" (any casing) to "LLC" in MCA.company.
 * Uses a cursor + bulkWrite to handle very large collections without
 * loading everything into memory.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MCA = require('../models/MCA');

const BATCH_SIZE = parseInt(process.env.NORMALIZE_COMPANY_BATCH || '1000', 10);

const normalizeCompany = (company) => {
  if (typeof company !== 'string') return null;
  const normalized = company.replace(/llc/gi, 'LLC');
  return normalized !== company ? normalized : null;
};

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set in environment variables');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected');

  const filter = { company: { $regex: /llc/i } };
  const cursor = MCA.find(filter)
    .select({ _id: 1, company: 1 })
    .lean()
    .cursor();

  let batch = [];
  let scanned = 0;
  let modified = 0;

  try {
    for await (const doc of cursor) {
      scanned += 1;
      const normalized = normalizeCompany(doc.company);
      if (!normalized) continue;

      batch.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { company: normalized } }
        }
      });

      if (batch.length >= BATCH_SIZE) {
        const res = await MCA.bulkWrite(batch, { ordered: false });
        modified += res.modifiedCount || 0;
        console.log(`📦 Processed batch: scanned=${scanned}, updated so far=${modified}`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      const res = await MCA.bulkWrite(batch, { ordered: false });
      modified += res.modifiedCount || 0;
      console.log(`📦 Final batch applied: updated so far=${modified}`);
    }

    console.log(`🎯 Completed. Records scanned=${scanned}, updated=${modified}`);
  } catch (err) {
    console.error('❌ Error during normalization:', err);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Connection closed');
    process.exit(0);
  }
};

run();

