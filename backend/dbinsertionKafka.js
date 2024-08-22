const express = require('express');
const cors = require('cors');
const GroupChatMessage = require("./dbSchema/GroupChatMessage");
const OneOnOneChatMessage = require("./dbSchema/OneOnOneChatMessage");
const { connectToMongoDB } = require('./controllers/dbconnection');
const { kafka, producer, getConsumer } = require('./controllers/healsynckafka');
const app = express();
app.use(cors());

connectToMongoDB();

const runConsumer = async () => {
    const consumer = await getConsumer('healsyncdb');
    await consumer.connect();
    await consumer.subscribe({ topic: 'Messages' });

    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
            const { key, value } = message;
            const parsedMessage = JSON.parse(value.toString());
            if (key) {
                const timestamp = parseInt(key.toString());
                if (parsedMessage.room) {
                    const roomMessage = new RoomChatMessage({
                        room: parsedMessage.room,
                        sender: parsedMessage.sender,
                        content: parsedMessage.content,
                        createdAt: new Date(timestamp),
                    });
                    try {
                        await roomMessage.save();
                    } catch (error) {
                        console.error('Error saving room message:', error.message);
                    }
                }
                else if (parsedMessage.receiverId) {
                    const oneOnOneMessage = new OneOnOneChatMessage({
                        senderId: parsedMessage.senderId,
                        receiverId: parsedMessage.receiverId,
                        content: parsedMessage.content,
                        createdAt: new Date(timestamp),
                    });
                    try {
                        await oneOnOneMessage.save(); s
                    } catch (error) {
                        console.error('Error saving one-on-one message:', error.message);
                    }
                } else {
                    const groupChatMessage = new GroupChatMessage({
                        senderId: parsedMessage.senderId,
                        content: parsedMessage.content,
                        createdAt: new Date(timestamp),
                    });
                    try {
                        await groupChatMessage.save();
                    } catch (error) {
                        console.error('Error saving group chat message:', error.message);
                    }
                }
            } else {
                console.log('Message key not found.');
            }
        },
    });
};
runConsumer().catch(console.error);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`fetchService running on port ${PORT}`);
});