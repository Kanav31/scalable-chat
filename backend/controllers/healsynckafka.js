const { Kafka } = require('kafkajs');

// ─── Why env-based config? ────────────────────────────────────────────────────
// Local dev → Docker Kafka on localhost:9092, no auth needed
// Production → Redpanda Cloud, requires SSL + SASL credentials
// One file handles both by reading from environment variables.
// The NODE_ENV flag is the switch — never hardcode either config.

const isProduction = process.env.NODE_ENV === 'production';

const kafkaConfig = {
    clientId: 'threads-app',
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
};

// Only attach SSL/SASL in production (Redpanda Cloud requires it, local Docker does not)
if (isProduction) {
    kafkaConfig.ssl = true;
    kafkaConfig.sasl = {
        mechanism: 'scram-sha-256',
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
    };
}

const kafka = new Kafka(kafkaConfig);

// One shared producer instance — creating a producer per request would be very expensive
// (each producer opens a TCP connection to Kafka). Share and reuse.
const producer = kafka.producer();

// Factory function so each consumer gets its own groupId.
// Different groupIds = independent consumers that both receive every message.
// Same groupId = load-balanced consumers that share the work.
const getConsumer = (groupId) => {
    return kafka.consumer({ groupId });
};

module.exports = { kafka, producer, getConsumer };
