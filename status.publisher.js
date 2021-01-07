var amqp = require("amqplib/callback_api");
const dotenv = require("dotenv");
dotenv.config();

exports.publish = function (payload) {
    amqp.connect(process.env.RABBITMQ_URI, function (error0, connection) {
        if (error0) {
            console.log(error0);
            //throw error0;
        }
        connection.createChannel(function (error1, channel) {
            if (error1) {
                console.log(error1);
            }
            var exchange = process.env.EXCHANGE_PUBLISHER;

            channel.assertExchange(exchange, "fanout");

            channel.publish(exchange, "mibot.mibotair.agent.status", Buffer.from(JSON.stringify(payload)));
            console.log(" [x] Sent %s", payload);
        });
    });
};
