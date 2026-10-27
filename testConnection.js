const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testUri(uri, label) {
  if (!uri) {
    console.log(`[${label}] No URI provided.`);
    return false;
  }
  console.log(`\nTesting connection to [${label}]...`);
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    console.log(`✅ [${label}] Connected successfully!`);
    return true;
  } catch (err) {
    console.error(`❌ [${label}] Connection failed: ${err.message}`);
    return false;
  } finally {
    try { await client.close(); } catch (_) {}
  }
}

async function run() {
  console.log('=== MongoDB Connection Diagnostic ===');
  const primaryOk = await testUri(process.env.MONGO_URI, 'Primary MONGO_URI');
  const localOk = await testUri('mongodb://127.0.0.1:27017/financeBuddy', 'Local MongoDB');

  console.log('\n--- Diagnostic Summary ---');
  if (primaryOk) {
    console.log('Your primary MONGO_URI is active and working.');
  } else if (localOk) {
    console.log('Local MongoDB is active and working! Finance Buddy will use local MongoDB.');
  } else {
    console.log('Neither primary nor local MongoDB could be reached.');
    console.log('To start local MongoDB: run "start-mongo.bat" or "npm run mongo" in a separate terminal.');
    console.log('Or update MONGO_URI in .env with your current MongoDB Atlas connection string.');
  }
}

run();
