require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectToMongoDB } = require('./controllers/dbconnection');
const GroupChatMessage = require('./dbSchema/GroupChatMessage');
const OneOnOneChatMessage = require('./dbSchema/OneOnOneChatMessage');

// ─── What this service does ───────────────────────────────────────────────────
// Pure REST API. When a user opens the app, the frontend calls this once to load
// their chat history. After that, all new messages arrive via Socket.IO.
//
// BUG FIX: original code tried to run on port 5000, same as socketservice.js.
// Two Node processes cannot bind to the same port — one would silently fail.
// This service now runs on port 5002.
//
// Why not serve history through Socket.IO?
// REST is the right tool for a one-shot request/response. Socket.IO is for
// continuous real-time streams. Mixing the two makes each harder to reason about.

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60, // slightly stricter than socketservice — this hits the DB every call
    standardHeaders: true,
    legacyHeaders: false,
}));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'fetchservice' }));

// GET /api/chat/:username
// Returns all group chat messages + all DMs where the user is sender or receiver,
// organized as: { "group-chat": [...], "otherUsername": [...], ... }
app.get('/api/chat/:username', async (req, res) => {
    const { username } = req.params;

    // Input validation — reject clearly invalid usernames before hitting the DB
    // This prevents NoSQL injection and wasted queries
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid username' });
    }
    if (username.length > 32) {
        return res.status(400).json({ error: 'Username too long' });
    }

    const sanitized = username.trim();

    try {
        const [groupMessages, dmMessages] = await Promise.all([
            // Load last 100 group messages — never return unbounded arrays to the client
            GroupChatMessage.find()
                .sort({ createdAt: 1 })
                .limit(100)
                .lean(),
            // Load all DMs involving this user — both sides of the conversation
            OneOnOneChatMessage.find({
                $or: [{ senderId: sanitized }, { receiverId: sanitized }],
            })
                .sort({ createdAt: 1 })
                .lean(),
        ]);

        // Shape the response so the frontend can do O(1) lookups by conversation partner
        const result = { 'group-chat': groupMessages };

        dmMessages.forEach((msg) => {
            // The "other person" in the conversation is whoever is NOT the requesting user
            const key = msg.senderId === sanitized ? msg.receiverId : msg.senderId;
            if (!result[key]) result[key] = [];
            result[key].push(msg);
        });

        return res.json(result);
    } catch (error) {
        // Generic error to client — detailed error stays in logs (never expose internals)
        console.error('[fetchService] Error fetching chat:', error.message, { username: sanitized });
        return res.status(500).json({ error: 'Failed to load messages' });
    }
});

const start = async () => {
    await connectToMongoDB();
    const PORT = process.env.FETCH_PORT || 5002;
    app.listen(PORT, () => {
        console.log(`[Server] Threads fetch service running on port ${PORT}`);
    });
};

start().catch((err) => {
    console.error('[fetchService] Fatal startup error:', err);
    process.exit(1);
});
