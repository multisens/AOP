require('dotenv').config();
const mqtt = require('mqtt');

const client = mqtt.connect(`mqtt://${process.env.MQTT_HOST}`, {
    clientId : 'aop-client',
    clean : true,
    connectTimeout : 4000,
});


const TOPIC = {
    users: 'aop/users',
    current_user: 'aop/currentUser',
    services: 'aop/services'
}

const TOPIC_HANDLER = new Map();


client.on('connect', () => {
    console.log('Connected to MQTT broker');
});


client.on('message', (topic, message) => {
    console.log(`Message received in ${topic}: ${message.toString()}`);

    if (TOPIC_HANDLER.has(topic)) {
        TOPIC_HANDLER.get(topic).forEach(f => {
            f(message.toString());
        });
    }
    else {
        console.log(`no handler for topic ${topic}`);
    }
});

function addTopicHandler(t, f) {
    if (TOPIC_HANDLER.has(t)) {
        TOPIC_HANDLER.get(t).push(f);
    }
    else {
        TOPIC_HANDLER.set(t, [f]);
        client.subscribe(t, { noLocal : true }); 
        console.log(`Subscribed to topic ${t}`);
    }
}

function publish(t, m, r = true) {
    client.publish(t, m, { retain : r });
}


module.exports = {
    TOPIC,
    publish,
    addTopicHandler
};