# Scalable Chat Application using Kafka and Socket.io

This application is scalable application here we are using kafka for Intermediate Message Broker as well as for socket.io scalablility.

## Getting Started

1. Go to aiven cloud and get your credentials and go to ```controllers\healsynckafka.js```. 
2. ```
        const kafka = new Kafka({
        brokers: [''],
        ssl: {
            ca: [fs.readFileSync("./ca.pem", "utf-8")],
        },
        sasl: {
            username: "",
            password: "",
            mechanism: ""
        }
    });


