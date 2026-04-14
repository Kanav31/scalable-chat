const mongoose = require('mongoose');

// ─── Why retry logic? ─────────────────────────────────────────────────────────
// When the app starts, MongoDB (especially in Docker) may not be ready yet.
// Without retries, the app crashes immediately on startup and never recovers.
// With retries, it waits a few seconds and tries again — self-healing on startup.

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const connectToMongoDB = async () => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                // These two options prevent the "buffering timed out" error
                // that happens when Mongoose tries to run queries before connecting
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log('[MongoDB] Connected successfully');
            return;
        } catch (err) {
            console.error(`[MongoDB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
            if (attempt < MAX_RETRIES) {
                console.log(`[MongoDB] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                // All retries exhausted — crash loudly so the process restarter
                // (Docker, Fly.io, PM2) knows to bring it back up
                console.error('[MongoDB] All connection attempts failed. Exiting.');
                process.exit(1);
            }
        }
    }
};

module.exports = { connectToMongoDB };
