import * as dotenv from 'dotenv';
import mqtt, { MqttClient } from 'mqtt';
dotenv.config();

let brokerUrl : string = process.env.BROKER as string;
const client:MqttClient = mqtt.connect(brokerUrl, {
    clientId : 'app-client',
    clean : true,
    connectTimeout : 4000,
    protocolVersion: 5
});


export const TOPIC = {
    users: 'aop/users',
    current_user: 'aop/currentUser',
    services: 'aop/services',
    current_service: 'aop/currentService',
    current_app: 'aop/:serviceId/currentApp',
    app_path: 'aop/:serviceId/:appId/path',
    app_nodes: 'aop/:serviceId/:appId/doc/nodes',
    app_doc: 'aop/:serviceId/:appId/doc',
    devices: 'aop/devices'
}

type TopicHandler = {
    (m:string): void;
};
const TOPIC_HANDLER = new Map<string, TopicHandler[]>();


client.on('connect', () => {
    console.log('Connected to MQTT broker');
});


client.on('message', (topic, message) => {
    console.log(`Message received in ${topic}: ${message.toString()}`);

    if (TOPIC_HANDLER.has(topic)) {
        TOPIC_HANDLER.get(topic)?.forEach(f => {
            f(message.toString());
        });
    }
    else {
        console.log(`no handler for topic ${topic}`);
    }
});


export function addTopicHandler(t:string, f:TopicHandler) {
    if (TOPIC_HANDLER.has(t)) {
        TOPIC_HANDLER.get(t)?.push(f);
    }
    else {
        TOPIC_HANDLER.set(t, [f]);
        client.subscribe(t, { qos : 1, nl : true }); 
        console.log(`Subscribed to topic ${t}`);
    }
}


export function publish(t:string, m:string, r = true) {
    client.publish(t, m, { retain : r });
}


export function parseTopic(topic: string, params: Record<string, string>): string {
    let parts = topic.split('/');
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith(':')) {
            let key = parts[i].substring(1);
            if (key in params) {
                parts[i] = params[key];
            }
        }
    }

    return parts.join('/');
}