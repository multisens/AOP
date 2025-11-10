module.exports = {
    apps: [
        {
            name: 'broker',
            script: '/usr/sbin/mosquitto',
            args: '-c ./mosquitto/mosquitto.conf',
            interpreter: 'none',
            wait_ready: true,
            autorestart: false
        },
        {
            name: 'aop',
            cwd: './aop',
            script: 'npm',
            args: 'start',
            interpreter: 'none',
            wait_ready: true,
            autorestart: false,
            env: {
                PORT: 8080,
                MQTT_HOST: 'localhost',
                USER_DATA_PATH: '../user-files'
            }
        },
        {
            name: 'tv3ws',
            cwd: './ccws',
            interpreter: "none",
            script: "/bin/bash",
            args: '-c "npm run build && npm start"',
            wait_ready: true,
            env: {
                PORT: 44642,
                BROKER: 'mqtt://localhost',
                SERVER_URL: 'localhost',
                // SERVER_URL: '192.168.0.148',
                USER_DATA_FILE: '../user-files/userData.json',
                USER_THUMBS: '../user-files/thumbs'
            }
        }
    ]
    }
