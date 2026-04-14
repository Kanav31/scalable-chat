const socketIo = require('socket.io');
const http = require('http');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// ─── Why the Redis adapter? ───────────────────────────────────────────────────
// Socket.IO normally only knows about sockets connected to the SAME server process.
// When you scale to 2+ servers, Server 1 cannot emit to a socket on Server 2.
//
// The Redis adapter fixes this using Redis pub/sub as a shared event bus:
//   Server 1 wants to emit to socketId XYZ
//   → publishes to Redis
//   → all servers receive it
//   → the server that actually has XYZ's connection delivers it
//
// Two separate Redis clients are required — a client in subscribe mode
// cannot send regular commands on the same connection (Redis protocol rule).

const createSocketServer = async (app) => {
    const server = http.createServer(app);

    const io = socketIo(server, {
        cors: {
            // In production, lock this down to your actual frontend URL
            origin: process.env.CLIENT_ORIGIN || '*',
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Parse Redis URL into host/port explicitly — passing the full URL string
    // to ioredis can cause it to miscalculate internal timeouts (TimeoutNegativeWarning)
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const parsedUrl = new URL(redisUrl);
    const redisConfig = {
        host: parsedUrl.hostname,
        port: parseInt(parsedUrl.port) || 6379,
        ...(parsedUrl.password && { password: parsedUrl.password }),
    };

    const pubClient = new Redis(redisConfig);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.error('[Redis pub] error:', err.message));
    subClient.on('error', (err) => console.error('[Redis sub] error:', err.message));

    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket.IO] Redis adapter attached');

    return { server, io };
};

module.exports = createSocketServer;
