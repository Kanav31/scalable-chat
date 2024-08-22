require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { kafka, producer, getConsumer } = require('./controllers/healsynckafka');
const createSocketServer = require('./controllers/socketserver');
const GroupChatMessage = require("./dbSchema/GroupChatMessage");
const OneOnOneChatMessage = require("./dbSchema/OneOnOneChatMessage");
const RoomChatMessage = require("./dbSchema/RoomMessages");
// const { Kafka } = require('kafkajs');
// const fs = require('fs');

const app = express();

app.use(cors({
    origin: '*'
}));

const { server, io } = createSocketServer(app);

const runConsumer = async () => {
    const consumer = await getConsumer('healsync');
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
                        io.to(room).emit("roommessage", roomMessage);
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
                        const receiverSocket = users[parsedMessage.receiverId];
                        if (receiverSocket) {
                            receiverSocket.emit('privateMessage', oneOnOneMessage);
                        } else {
                            console.log('Receiver is not online or invalid.');
                        }
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

                        io.emit('message', groupChatMessage);
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

const runProducer = async () => {
    await producer.connect();
};

const sendMessage = async (key, message) => {
    try {
        await producer.send({
            topic: 'Messages',
            messages: [{ key: key.toString(), value: JSON.stringify(message) }],
        });
    } catch (error) {
        console.error('Error sending message:', error.message);
    }
};

runConsumer().catch(console.error);
runProducer().catch(console.error);



const users = {};
io.on('connection', (socket) => {
    console.log('New user connected ->', socket.id, ' on PORT --> username', PORT);
    socket.on('setUsername', (username) => {
        users[username] = socket;
        console.log(`Username set for ${socket.id}: ${username}`);
    });

    socket.on("fetchMessages", async (room) => {
        try {
            const messages = await RoomChatMessage.find({ room }).sort({ createdAt: 1 }).exec();
            socket.emit("fetchedMessages", messages);
        } catch (err) {
            console.error("Error fetching messages:", err);
        }
    });

    socket.on('message', async (data) => {
        const timestamp = new Date().getTime();
        const message = new GroupChatMessage({
            senderId: data.senderId,
            content: data.content,
        });
        await sendMessage(timestamp, message);
    });

    socket.on("joinRoom", async ({ room, sender }) => {
        socket.join(room);
    });

    socket.on("roommessage", async (data) => {
        const { room, sender, content } = data;
        console.log("server roommessage event on - ", room, sender, content)
        const timestamp = new Date().getTime();


        const newMessage = new RoomChatMessage({
            room: room,
            sender: sender,
            content: content
        })

        await sendMessage(timestamp, newMessage)


        console.log("sended to roomsg event");
    });
    socket.on("leaveRoom", (roomName) => {
        socket.leave(roomName);
    });
    socket.on('privateMessage', async (data) => {
        const timestamp = new Date().getTime();
        const { username, content, senderId } = data;
        const message = new OneOnOneChatMessage({
            senderId: senderId,
            receiverId: username,
            content: content
        });
        await sendMessage(timestamp, message);

    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
