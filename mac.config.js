module.exports = {
    apps : [
        {
            name        : 'broker',
            cwd         : './mosquitto',
            script      : 'start-broker.sh',
            interpreter : '/bin/bash',
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
                USER_DATA_PATH  : '../user-files'
            }
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
                USER_DATA_FILE  : '../user-files/userData.json',
                USER_THUMBS     : '../user-files/thumbs'
            }
        }
    ]
}