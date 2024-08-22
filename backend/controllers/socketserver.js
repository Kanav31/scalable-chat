const socketIo = require('socket.io');
const http = require('http');

const createSocketServer = (app) => {
    const server = http.createServer(app);
    const io = socketIo(server, {
        cors: {
            origin: '*',
        }
    });

    return { server, io };
};

module.exports = createSocketServer;
