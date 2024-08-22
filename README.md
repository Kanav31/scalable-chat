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
3. download ca.pem file and paste it to your backend's root directory.

1. docker build -t apigateway-image -f ./Dockerfile.apigateway . 
2. docker build -t fetchservice-image -f ./Dockerfile.fetchService .
3. docker build -t socketservice-image -f ./Dockerfile.socketservice .
4. docker build -t dbinsertionkafka-image -f ./Dockerfile.dbinsertionkafka .
5. docker compose up


## Contribution

We are open For contribution.
1. We are having issues in Dockerfile. 
2. Create Multiple Instances of socketservice.js and implement Ngnix as LoadBalancer



## 

# Fork and Give a Star

[Instagram](https://www.instagram.com/alloneofficialpage/)


