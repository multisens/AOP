const DATA = {
    topics: {
        current_user: 'aop/currentUser'
    },
    environment: {}
}

function postFrameMessage(msg) {
    window.parent.postMessage(JSON.stringify(msg), '*');
}


function receiveFrameMessage(e) {
    let m = JSON.parse(e.data);

    if (m.type == 'key') {
        if (typeof navigate === 'function') {
            navigate(m.key);
        }
        if (typeof handleKey === 'function') {
            handleKey(m.key);
        }
    }
    else if (m.type == 'env') {
        DATA.environment = JSON.parse(m.data);
        setCurrentUser(DATA.environment.aop.currentUser);
    }
    else if (m.type == 'message') {
        if (m.topic == DATA.topics.current_user) {
            setCurrentUser(m.message);
            if (typeof handleUserUpdate === 'function') {
                    handleUserUpdate(uuid);
            }
        }

        if (typeof handleMessage === 'function') {
            handleMessage(m);
        }
    }
}


function back() {
    if (typeof beforeBack === 'function') {
        beforeBack();
    }

    postFrameMessage({
        type: 'save',
        name: 'currentService',
        value: ''
    });
    postFrameMessage({
        type: 'load',
        dest: 'dtv'
    });
}


function openProfile() {
    postFrameMessage({
        type: 'load',
        dest: 'profile'
    });
}


function fullscreen() {
    console.log('enter fullscreen');
}


function setCurrentUser(uuid) {
    if ($('#user').length == 0) return;

    let users = DATA.environment.aop.users;
    for(i = 0; i < users.length; i++) {
        // find the user by its id
        if (users[i].id == uuid) {
            DATA.environment.aop.userIndex = i;

            $('#user_img').attr('src', users[i].avatar);
            $('#user_name').html(users[i].name);
            
            break;
        }
    }
}