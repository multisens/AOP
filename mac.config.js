module.exports = {
    apps : [
        {
            name        : 'broker',
            script      : '/opt/homebrew/sbin/mosquitto',
            args        : '-c /opt/homebrew/etc/mosquitto/mosquitto.conf',
            interpreter : 'none',
            wait_ready  : true,
            autorestart : false
        },
        {
            name        : 'aop',
            cwd         : './aop',
            script      : 'npm',
            args        : 'start',
            interpreter : 'none',
            wait_ready  : true,
            autorestart : false,
            env : {
                PORT            : 8080,
                BROKER          : 'mqtt://localhost',
                SCREENWIDTH     : 1440,
                USER_DATA_PATH  : '/Users/joel/Coding/GingaDistrib/user-files'
            }
        },
        {
            name        : 'apps',
            cwd         : './apps',
            script      : 'npm',
            args        : 'start',
            interpreter : 'none',
            wait_ready  : true,
            autorestart : false,
            env : {
                PORT            : 8081,
                BROKER          : 'mqtt://localhost',
                USER_DATA_PATH  : '/Users/joel/Coding/GingaDistrib/user-files'
            }
        },
        {
            name        : 'stream-flower',
            cwd         : './apps',
            interpreter : '/bin/bash',
            autorestart : false,
            script      : './stream.sh',
            args        : 'public/media/cefet/flowerVideo.mp4'
        },
        {
            name        : 'stream-sea',
            cwd         : './apps',
            interpreter : '/bin/bash',
            autorestart : false,
            script      : './stream.sh',
            args        : 'public/media/cefet/seaVideo.mp4'
        },
        {
            name        : 'tv3ws',
            cwd         : './ccws',
            script      : 'npm',
            args        : 'start',
            interpreter : 'none',
            wait_ready  : true,
            env : {
                PORT            : 44642,
                BROKER          : 'mqtt://localhost',
                SERVER_URL      : 'localhost',
                USER_DATA_FILE  : '/Users/joel/Coding/GingaDistrib/user-files/userData.json',
                USER_THUMBS     : '/Users/joel/Coding/GingaDistrib/user-files/thumbs'
            }
        },
        {
            name        : 'topic-explorer',
            interpreter : '/bin/bash',
            autorestart : false,
            script      : './start-chrome.sh',
            args        : './mqtt-explorer/index.html'
        },
        {
            name        : 'remote-device',
            interpreter : '/bin/bash',
            autorestart : false,
            script      : './start-chrome.sh',
            args        : './remote-device/index.html'
        }
    ]
}