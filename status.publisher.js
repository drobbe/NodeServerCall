const amqp = require("amqplib");
const dotenv = require("dotenv");
dotenv.config();

var RABBIT_URL = process.env.RABBITMQ_URI;
var RABBIT_EXCHANGE = process.env.EXCHANGE_PUBLISHER;
const amqpConnect = amqp.connect(RABBIT_URL);

let channel = null;
amqpConnect
    .then((conn) => {
        console.info("Conectado a rabbitmq.");
        return conn.createChannel();
    })
    .then((ch) => {
        console.info("Conectado al exchange rabbitmq: " + RABBIT_EXCHANGE);
        return ch.assertExchange(RABBIT_EXCHANGE, "fanout").then((ok) => {
            channel = ch;
        });
    })
    .catch((errors) => {
        console.log(errors);
        console.error({ message: errors });
    });

module.exports.publish = (payload) => {
    channel.publish(RABBIT_EXCHANGE, "mibot.mibotair.agent.status", Buffer.from(JSON.stringify(payload)));
};
