require('dotenv').config();

const { getConsumer } = require('./controllers/healsynckafka');
const { connectToMongoDB } = require('./controllers/dbconnection');
const GroupChatMessage = require('./dbSchema/GroupChatMessage');
const OneOnOneChatMessage = require('./dbSchema/OneOnOneChatMessage');
// BUG FIX: RoomChatMessage was used in the original code but never imported.
// That caused a ReferenceError crash at runtime whenever a room message arrived.
const RoomChatMessage = require('./dbSchema/RoomMessages');

// ─── What this process does ───────────────────────────────────────────────────
// This is a standalone Node process — it has NO socket server, NO HTTP server.
// Its only job: read from Kafka topic "Messages" and save each message to MongoDB.
//
// Why is this separate from socketservice.js?
// Decoupling. If MongoDB is slow or temporarily down, message delivery to clients
// is completely unaffected. The Kafka consumer here will just lag behind and catch up
// once MongoDB recovers — no user ever sees a delay in receiving messages.
//
// Consumer group: "threads-db"
// This is DIFFERENT from socketservice.js's "threads-relay" group.
// Both groups receive every message independently from Kafka.

// ─── Why idempotent saves? ────────────────────────────────────────────────────
// Kafka guarantees at-least-once delivery. This means in rare cases (crash after
// processing but before committing the offset) a message may be consumed twice.
// We use updateOne + upsert so saving the same message twice has no side effect.
// The kafkaTimestamp is our unique identifier per message.

const saveGroupMessage = async (parsed, timestamp) => {
    await GroupChatMessage.updateOne(
        { kafkaTimestamp: timestamp },
        { $setOnInsert: { senderId: parsed.senderId, content: parsed.content, createdAt: new Date(timestamp) } },
        { upsert: true }
    );
};

const savePrivateMessage = async (parsed, timestamp) => {
    await OneOnOneChatMessage.updateOne(
        { kafkaTimestamp: timestamp },
        { $setOnInsert: { senderId: parsed.senderId, receiverId: parsed.receiverId, content: parsed.content, createdAt: new Date(timestamp) } },
        { upsert: true }
    );
};

const saveRoomMessage = async (parsed, timestamp) => {
    await RoomChatMessage.updateOne(
        { kafkaTimestamp: timestamp },
        { $setOnInsert: { room: parsed.room, sender: parsed.sender, content: parsed.content, createdAt: new Date(timestamp) } },
        { upsert: true }
    );
};

const start = async () => {
    await connectToMongoDB();

    const consumer = getConsumer('threads-db');
    await consumer.connect();
    await consumer.subscribe({ topic: 'Messages', fromBeginning: false });
    console.log('[Kafka] DB consumer connected and subscribed to "Messages"');

    await consumer.run({
        eachMessage: async ({ message }) => {
            const { key, value } = message;
            if (!key || !value) return;

            const timestamp = parseInt(key.toString());
            const parsed = JSON.parse(value.toString());

            try {
                if (parsed.room) {
                    await saveRoomMessage(parsed, timestamp);
                } else if (parsed.receiverId) {
                    // BUG FIX: original code had a stray `s` after this line causing a syntax error
                    await savePrivateMessage(parsed, timestamp);
                } else {
                    await saveGroupMessage(parsed, timestamp);
                }
            } catch (error) {
                // Log and continue — never crash the consumer on a single bad message.
                // If we threw here, the process would die and ALL subsequent messages
                // would pile up unprocessed in Kafka.
                console.error('[DB Worker] Error saving message:', error.message, { parsed });
            }
        },
    });
};

start().catch((err) => {
    console.error('[DB Worker] Fatal startup error:', err);
    process.exit(1);
});
