const decodeMessage = message => {
    return JSON.parse(
        decodeURIComponent(
            escape(message)
        )
    );
};
const encodeMessage = message => {
    return unescape(
        encodeURIComponent(
            JSON.stringify(message)
        )
    );
};

let webSocket = null;

function runWsConnection() {
    if (webSocket !== null) {
        console.warn('WS connection is already opened');
        return;
    }
    let restartAttempts = 0;

    function restartWs() {
        webSocket = null;
        if (restartAttempts > 5) {
            console.error('Maximum WS restart attempts reached');
            return;
        }
        restartAttempts++;
        console.info('WS reconnecting');
        startWs();
    }

    function startWs() {
        webSocket = new WebSocket('ws://127.0.0.1:8001');
        webSocket.onopen = () => {
            restartAttempts = 0;
            console.info('WS connection opened');
            document.querySelector('.message.error-connection').classList.remove('opened');
            document.querySelector('.message.connected').classList.add('opened');
            setTimeout(() => {
                document.querySelector('.message.connected').classList.remove('opened');
            }, 1000);
        };
        webSocket.onmessage = message => {
            const decodedMessage = decodeMessage(message.data);
            const {type, payload} = decodedMessage;
            switch (type) {
                case 'SET_ID':
                    userTank.uid = payload.id;

                    sendMessage({type: 'ADD_TANK', payload: {tank: userTank}})
                    break;
                case 'TANKS_DATA':
                    TANKS.length = 0;
                    TANKS.push(...payload.tanks.filter(tank => tank.uid !== userTank.uid));
                    break;
            }
        };

        webSocket.onclose = () => {
            console.info('WS connection closed');
            document.querySelector('.message.error-connection').classList.add('opened');
            restartWs();
        }
    }

    startWs();
}

function sendMessage(data) {
    if (!canSendMessage()) {
        return;
    }
    webSocket.send(encodeMessage(data))
}

function canSendMessage() {
    return webSocket?.readyState === WebSocket.OPEN;
}
