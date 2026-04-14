const mongoose = require('mongoose');

const groupChatMessageSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    content:  { type: String, required: true },
    // kafkaTimestamp is stored so the DB writer can do idempotent upserts.
    // If the same Kafka message is consumed twice (at-least-once delivery),
    // the upsert finds the existing doc by kafkaTimestamp and does nothing.
    kafkaTimestamp: { type: Number },
    createdAt: { type: Date, default: Date.now },
});

// Index on createdAt — the fetchService always queries with .sort({ createdAt: 1 })
// Without this index, MongoDB does a full collection scan on every history load.
groupChatMessageSchema.index({ createdAt: 1 });
groupChatMessageSchema.index({ kafkaTimestamp: 1 }, { unique: true, sparse: true });

const GroupChatMessage = mongoose.model('GroupChatMessage', groupChatMessageSchema);
module.exports = GroupChatMessage;
