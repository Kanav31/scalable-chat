const mongoose = require('mongoose');

const oneOnOneChatMessageSchema = new mongoose.Schema({
    senderId:   { type: String, required: true },
    receiverId: { type: String, required: true },
    content:    { type: String, required: true },
    kafkaTimestamp: { type: Number },
    createdAt: { type: Date, default: Date.now },
});

// Compound index on senderId + receiverId — the fetchService queries:
//   { $or: [{ senderId: X }, { receiverId: X }] }
// Individual indexes on each field let MongoDB use index intersection for this query.
oneOnOneChatMessageSchema.index({ senderId: 1 });
oneOnOneChatMessageSchema.index({ receiverId: 1 });
oneOnOneChatMessageSchema.index({ createdAt: 1 });
oneOnOneChatMessageSchema.index({ kafkaTimestamp: 1 }, { unique: true, sparse: true });

const OneOnOneChatMessage = mongoose.model('OneOnOneChatMessage', oneOnOneChatMessageSchema);
module.exports = OneOnOneChatMessage;
