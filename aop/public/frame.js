/*
MQTT-RELATED MESSAGE TYPES
    {
        type: 'message',
        topic: [String],
        message: [String]
    }
    {
        type: 'subscribe',
        topic: [String]
    }
    {
        type: 'publish',
        topic: [String],
        message: [String],
        retain: [Boolean]
    }

ACTION MESSAGE TYPES
    {
        type: 'key',
        key: [String]
    }
    {
        type: 'load',
        dest: [String]
    }
    {
        type: 'save',
        name: [String],
        value: [String]
    }
*/

const DATA = {
    topics: {
        current_user: 'aop/currentUser',
	    current_service: 'aop/currentService',
        services: 'aop/services'
    },
    environment: {
        aop: {
            currentService: null,
            currentUser: null
        }
    }
};

function Init(url) {
    let mqttOptions = {
        clean: false,
        connectTimeout: 4000,
        clientId: 'dtv-client',
    };

    window.addEventListener('message', ReceiveFrameMessage);
    DATA.frame = document.getElementById('dtvFrame');
    DATA.frame.setAttribute('src',url);

    DATA.client = mqtt.connect('ws://localhost:9001/mqtt', mqttOptions);

    DATA.client.on('connect', () => {
        console.log('Connected to MQTT broker');

        // subscribe to topics
        DATA.client.subscribe(DATA.topics.current_user, { noLocal : true });
        DATA.client.subscribe(DATA.topics.current_service, { noLocal : true });
        DATA.client.subscribe(DATA.topics.services, { noLocal : true });

        PostFrameMessage({ type: 'load', dest: 'profile' });
    });

    DATA.client.on('message', HandleMessage);

    DATA.client.on('error', (err) => {
        console.error('MQTT Error:', err);
        // DATA.client.end();
    });

    document.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) {
            e.preventDefault();
        }

        PostFrameMessage({ type: 'key', key: e.key });
    });
}

function HandleMessage(t, m) {
    if (t == DATA.topics.current_user) {
        DATA.environment.aop.currentUser = m.toString();
    }
    else if (t == DATA.topics.current_service && m != '') {
        let sid = parseInt(m.toString());
        DATA.environment.aop.currentService = sid;
        if (DATA.frame !== undefined && DATA.services !== undefined) {
            DATA.frame.setAttribute('src', DATA.services[sid].initialMediaURL);
        }
        return; // do not post
    }
    else if (t == DATA.topics.services) {
        DATA.services = JSON.parse(m.toString());
        return; // do not post
    }

    PostFrameMessage({ type: 'message', topic: t, message: m.toString() });
}

function PostFrameMessage(msg) {
    DATA.frame.contentWindow.postMessage(JSON.stringify(msg), '*');
}

function ReceiveFrameMessage(e) {
    let m = JSON.parse(e.data);

    if (m.type == 'subscribe') {    // type, topic
        DATA.client.subscribe(m.topic, { noLocal : true });
    }
    else if (m.type == 'publish') { // type, topic, message, retain
        let r = m.retain ? m.retain : false;
        DATA.client.publish(m.topic, m.message, { retain : r });
    }
    else if (m.type == 'load') {    // type, dest
        DATA.frame.setAttribute('src',`http://localhost:8080/${m.dest}?prev=dtv`);
    }
    else if (m.type == 'save') {    // type, name, value
        if (m.name == 'users') {
            DATA.environment.aop.users = JSON.parse(m.value);
        }
        if (m.name == 'currentUser') {
            DATA.environment.aop.currentUser = m.value;
            DATA.client.publish(DATA.topics.current_user, m.value, { retain : true });
        }
        if (m.name == 'currentService') {
            DATA.environment.aop.currentService = m.value;
            DATA.client.publish(DATA.topics.current_service, m.value, { retain : true });
        }
    }
    else if (m.type == 'loaded') {
        PostFrameMessage({ type: 'env', data: JSON.stringify(DATA.environment) });
    }
}