require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const { producer, getConsumer } = require('./controllers/healsynckafka');
const createSocketServer = require('./controllers/socketserver');
const GroupChatMessage = require('./dbSchema/GroupChatMessage');
const OneOnOneChatMessage = require('./dbSchema/OneOnOneChatMessage');
const RoomChatMessage = require('./dbSchema/RoomMessages');

// ─── Why helmet? ──────────────────────────────────────────────────────────────
// Helmet sets ~14 HTTP security headers in one call:
// X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.
// These prevent a class of attacks (clickjacking, MIME sniffing, XSS) for free.

// ─── Why rate limiting? ───────────────────────────────────────────────────────
// Without it, a single client can hammer the server with thousands of requests/sec.
// This protects the HTTP endpoints (not socket events — those are handled separately).

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // max 100 HTTP requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
}));

// Health check — required by Fly.io, Render, and any load balancer
// to know if this instance is alive and ready to receive traffic
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'socketservice' }));

// ─── Redis client for user→socketId mapping ───────────────────────────────────
// We store: user:{username} → socketId  (to route private messages)
//           socket:{socketId} → username (to clean up on disconnect)
//
// Why Redis instead of a plain JS object?
// A JS object only lives in this process. With 2+ servers, Server 1's object
// doesn't know about users connected to Server 2. Redis is shared across all servers.

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('[Redis] error:', err.message));

// ─── Online users helpers ─────────────────────────────────────────────────────
// We keep a Redis Set called "online_users" — it's the source of truth for who
// is currently connected across ALL server instances.
//
// Why a Set and not just scanning user:* keys?
// redis.keys() scans the entire keyspace — slow and blocks Redis on large datasets.
// A Set gives O(1) add/remove and O(n) members retrieval — always fast.

const addOnlineUser = (username) => redis.sadd('online_users', username);

const removeOnlineUser = (username) => redis.srem('online_users', username);

// Fetch the full online list and broadcast it to every connected client.
// Called on every connect + disconnect so all clients stay in sync instantly.
const broadcastOnlineUsers = async () => {
    const users = await redis.smembers('online_users');
    io.emit('onlineUsers', users.sort()); // sorted so the list doesn't jump around
};

// ─── Kafka: send a message to the "Messages" topic ────────────────────────────
// The timestamp is used as the message KEY.
// Key determines which Kafka partition the message lands in.
// Using timestamp is simple but means messages from the same room/user
// may land on different partitions and lose ordering guarantees.
// Good enough for now — upgrade to room-based keys when strict ordering is needed.

const sendToKafka = async (key, message) => {
    try {
        await producer.send({
            topic: 'Messages',
            messages: [{ key: key.toString(), value: JSON.stringify(message) }],
        });
    } catch (error) {
        console.error('[Kafka] Failed to send message:', error.message);
    }
};

// ─── Kafka Consumer: "threads-relay" group ────────────────────────────────────
// This consumer reads from Kafka and emits back to Socket.IO clients.
// It does NOT save to DB — that's dbinsertionKafka.js's job.
//
// Why a separate consumer for relaying?
// Because DB writes can be slow. If we did both here, a slow DB write would
// delay the message from reaching the client. Separation = fast delivery always.

const runRelayConsumer = async () => {
    const consumer = getConsumer('threads-relay');
    await consumer.connect();
    await consumer.subscribe({ topic: 'Messages', fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            const { key, value } = message;
            if (!key || !value) return;

            const timestamp = parseInt(key.toString());
            const parsed = JSON.parse(value.toString());

            if (parsed.room) {
                // Room message — emit only to sockets in that room
                // BUG FIX: original code used undefined `room` variable here
                // it must be parsed.room from the Kafka message, not a scope variable
                io.to(parsed.room).emit('roommessage', {
                    room: parsed.room,
                    sender: parsed.sender,
                    content: parsed.content,
                    createdAt: new Date(timestamp),
                });
            } else if (parsed.receiverId) {
                // Private message — look up receiver's socketId from Redis
                // BUG FIX: original code used users[receiverId] which was an in-memory
                // map — broken with multiple servers. Redis lookup works across all servers.
                const receiverSocketId = await redis.get(`user:${parsed.receiverId}`);
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('privateMessage', {
                        senderId: parsed.senderId,
                        receiverId: parsed.receiverId,
                        content: parsed.content,
                        createdAt: new Date(timestamp),
                    });
                }
            } else {
                // Global group message — emit to every connected client
                io.emit('message', {
                    senderId: parsed.senderId,
                    content: parsed.content,
                    createdAt: new Date(timestamp),
                });
            }
        },
    });
};

// ─── Main startup ─────────────────────────────────────────────────────────────
// createSocketServer is async because it sets up the Redis adapter internally.
// We await it before attaching socket event handlers.

let io;

const start = async () => {
    const { server, io: socketIoInstance } = await createSocketServer(app);
    io = socketIoInstance;

    await producer.connect();
    console.log('[Kafka] Producer connected');

    await runRelayConsumer();
    console.log('[Kafka] Relay consumer running');

    // ─── Socket.IO event handlers ──────────────────────────────────────────────

    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);

        // ── setUsername ──────────────────────────────────────────────────────
        // Client sends their username immediately after connecting.
        // We store the bidirectional mapping in Redis so any server can route
        // messages to this socket by username.
        socket.on('setUsername', async (username) => {
            if (!username || typeof username !== 'string') return;
            const sanitized = username.trim().substring(0, 32);
            await redis.set(`user:${sanitized}`, socket.id, 'EX', 86400);
            await redis.set(`socket:${socket.id}`, sanitized, 'EX', 86400);
            // Add to online set and tell everyone — including the new user —
            // so their sidebar populates immediately on login
            await addOnlineUser(sanitized);
            await broadcastOnlineUsers();
            console.log(`[Socket] ${socket.id} registered as "${sanitized}"`);
        });

        // ── fetchMessages ────────────────────────────────────────────────────
        // Client requests history for a room when they join it.
        // Sorted ascending by createdAt so oldest messages appear at the top.
        socket.on('fetchMessages', async (room) => {
            if (!room || typeof room !== 'string') return;
            try {
                const messages = await RoomChatMessage
                    .find({ room: room.trim() })
                    .sort({ createdAt: 1 })
                    .limit(100) // cap at 100 messages — never return unbounded arrays
                    .lean();    // .lean() returns plain JS objects, faster than Mongoose docs
                socket.emit('fetchedMessages', messages);
            } catch (err) {
                console.error('[fetchMessages] Error:', err.message);
            }
        });

        // ── message (group chat) ─────────────────────────────────────────────
        // Global broadcast. Publish to Kafka — relay consumer will emit to all clients.
        socket.on('message', async (data) => {
            if (!data?.content?.trim() || !data?.senderId) return;
            const timestamp = Date.now();
            await sendToKafka(timestamp, {
                senderId: data.senderId,
                content: data.content.trim().substring(0, 2000), // max message length
            });
        });

        // ── joinRoom ─────────────────────────────────────────────────────────
        socket.on('joinRoom', ({ room, sender }) => {
            if (!room || typeof room !== 'string') return;
            socket.join(room.trim());
            console.log(`[Socket] ${sender} joined room "${room}"`);
        });

        // ── roommessage ──────────────────────────────────────────────────────
        // Room-scoped message. Publish to Kafka — relay consumer emits to room.
        socket.on('roommessage', async (data) => {
            if (!data?.room || !data?.content?.trim() || !data?.sender) return;
            const timestamp = Date.now();
            await sendToKafka(timestamp, {
                room: data.room.trim(),
                sender: data.sender,
                content: data.content.trim().substring(0, 2000),
            });
        });

        // ── leaveRoom ────────────────────────────────────────────────────────
        socket.on('leaveRoom', (room) => {
            if (!room || typeof room !== 'string') return;
            socket.leave(room.trim());
        });

        // ── privateMessage ───────────────────────────────────────────────────
        // DM between two users. Publish to Kafka — relay consumer looks up receiver
        // in Redis and emits directly to their socketId.
        socket.on('privateMessage', async (data) => {
            if (!data?.username || !data?.content?.trim() || !data?.senderId) return;
            const timestamp = Date.now();
            await sendToKafka(timestamp, {
                senderId: data.senderId,
                receiverId: data.username,
                content: data.content.trim().substring(0, 2000),
            });
        });

        // ── disconnect ───────────────────────────────────────────────────────
        // Clean up Redis keys and remove from online set.
        // broadcastOnlineUsers() after removal so everyone's sidebar updates instantly.
        socket.on('disconnect', async () => {
            const username = await redis.get(`socket:${socket.id}`);
            if (username) {
                await redis.del(`user:${username}`);
                await removeOnlineUser(username);
                await broadcastOnlineUsers();
            }
            await redis.del(`socket:${socket.id}`);
            console.log(`[Socket] Disconnected: ${socket.id}`);
        });
    });

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
        console.log(`[Server] Threads socket service running on port ${PORT}`);
    });
};

start().catch((err) => {
    console.error('[Server] Fatal startup error:', err);
    process.exit(1);
});
