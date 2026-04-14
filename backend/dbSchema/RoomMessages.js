const mongoose = require('mongoose');

const roomChatMessageSchema = new mongoose.Schema({
    room:    { type: String, required: true },
    sender:  { type: String, required: true },
    content: { type: String, required: true },
    kafkaTimestamp: { type: Number },
    createdAt: { type: Date, default: Date.now },
});

// Index on room + createdAt — the socket server queries:
//   RoomChatMessage.find({ room }).sort({ createdAt: 1 })
// A compound index on (room, createdAt) satisfies both the filter and the sort
// in a single index scan — much faster than filtering then sorting separately.
roomChatMessageSchema.index({ room: 1, createdAt: 1 });
roomChatMessageSchema.index({ kafkaTimestamp: 1 }, { unique: true, sparse: true });

const RoomChatMessage = mongoose.model('RoomChatMessage', roomChatMessageSchema);
module.exports = RoomChatMessage;
