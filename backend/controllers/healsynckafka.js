const { Kafka } = require('kafkajs');
const fs = require('fs');

const kafka = new Kafka({
    brokers: ["kafka-d5f38e9-scalability.k.aivencloud.com:28395"],
    ssl: {
        ca: [fs.readFileSync("./ca.pem", 'utf8')],
    },
    sasl: {
        username: "avnadmin",
        password: process.env.PASSWORD,
        mechanism: "plain"
    }
});
console.log("kafka setup");

const producer = kafka.producer();
console.log("producer running");


const getConsumer = (groupId) => {
    return kafka.consumer({ groupId });
};
module.exports = { kafka, producer, getConsumer };
