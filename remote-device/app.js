document.addEventListener('DOMContentLoaded', function() {
    // Elementos da interface
    const serverUrlInput = document.getElementById('serverUrl');
    const deviceClassInput = document.getElementById('deviceClass');
    const supportedTypeCheckboxes = document.querySelectorAll('.supported-type');
    const connectBtn = document.getElementById('connectBtn');
    const restStatus = document.getElementById('restStatus');
    const wsStatus = document.getElementById('wsStatus');
    const currentHandle = document.getElementById('currentHandle');
    const nodeIdValue = document.getElementById('nodeIdValue');
    const nodeSrcValue = document.getElementById('nodeSrcValue');
    const appIdValue = document.getElementById('appIdValue');
    const typeValue = document.getElementById('typeValue');
    const messageTimeline = document.getElementById('messageTimeline');
    const responseModal = document.getElementById('responseModal');
    const responseEventType = document.getElementById('responseEventType');
    const responseTransition = document.getElementById('responseTransition');
    const responseLabel = document.getElementById('responseLabel');
    const cancelResponseBtn = document.getElementById('cancelResponseBtn');
    const sendResponseBtn = document.getElementById('sendResponseBtn');
    const toggleConfigBtn = document.getElementById('toggleConfigBtn');
    const configSection = document.getElementById('configSection');
    
    // Estado da aplicação
    let currentServerUrl = 'http://localhost:44642';
    let websocket = null;
    let currentHandleValue = null;
    let currentNodeInfo = {
        nodeId: null,
        nodeSrc: null,
        appId: null,
        type: null
    };
    let selectedMessageForResponse = null;
    
    // Configurações iniciais
    serverUrlInput.value = currentServerUrl;
    deviceClassInput.value = 'guarana';

    // Configurar o toggle
    let configVisible = true;
    toggleConfigBtn.addEventListener('click', function() {
        configVisible = !configVisible;
        
        if (configVisible) {
            configSection.classList.remove('collapsed');
            toggleConfigBtn.innerHTML = '<i class="fas fa-sliders-h"></i>';
            toggleConfigBtn.title = "Ocultar configurações";
        } else {
            configSection.classList.add('collapsed');
            toggleConfigBtn.innerHTML = '<i class="fas fa-cog"></i>';
            toggleConfigBtn.title = "Mostrar configurações";
        }
    });
    
    // Event Listeners
    connectBtn.addEventListener('click', connectToServer);
    cancelResponseBtn.addEventListener('click', closeResponseModal);
    sendResponseBtn.addEventListener('click', sendResponse);
    
    // Função para conectar ao servidor
    function connectToServer() {
        currentServerUrl = serverUrlInput.value;
        const deviceClass = deviceClassInput.value;
        
        if (!deviceClass) {
            alert('Por favor, informe a Device Class');
            return;
        }
        
        // Obter supported types selecionados
        const supportedTypes = Array.from(supportedTypeCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        
        // Configurar payload para a requisição REST
        const payload = {
            deviceClass: deviceClass,
            supportedTypes: supportedTypes
        };
        
        // Fazer a chamada REST
        fetch(`${currentServerUrl}/tv3/remote-device`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Atualizar status REST
            restStatus.classList.add('connected');
            restStatus.querySelector('.status-dot').textContent = '✓';
            restStatus.textContent = 'REST: Conectado';
            
            // Guardar o handle recebido
            currentHandleValue = data.handle;
            currentHandle.textContent = currentHandleValue;
            
            // Conectar ao WebSocket
            connectWebSocket(data.url);
        })
        .catch(error => {
            console.error('Erro na conexão REST:', error);
            alert(`Erro ao conectar ao servidor: ${error.message}`);
        });
    }
    
    // Função para conectar ao WebSocket
    function connectWebSocket(url) {
        if (websocket) {
            websocket.close();
        }
        
        websocket = new WebSocket(url);
        
        websocket.onopen = function() {
            wsStatus.classList.add('connected');
            wsStatus.querySelector('.status-dot').textContent = '✓';
            wsStatus.textContent = 'WebSocket: Conectado';
        };
        
        websocket.onmessage = function(event) {
            try {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            } catch (error) {
                console.error('Erro ao processar mensagem WebSocket:', error);
            }
        };
        
        websocket.onclose = function() {
            wsStatus.classList.remove('connected');
            wsStatus.querySelector('.status-dot').textContent = '';
            wsStatus.textContent = 'WebSocket: Desconectado';
        };
        
        websocket.onerror = function(error) {
            console.error('Erro WebSocket:', error);
            wsStatus.classList.remove('connected');
            wsStatus.querySelector('.status-dot').textContent = '✗';
            wsStatus.textContent = 'WebSocket: Erro de conexão';
        };
    }
    
    // Função para lidar com mensagens WebSocket
    function handleWebSocketMessage(message) {
        // Verificar se é a mensagem inicial com informações do nó
        if (message.nodeId && message.nodeSrc && message.appId && message.type) {
            currentNodeInfo = {
                nodeId: message.nodeId,
                nodeSrc: message.nodeSrc,
                appId: message.appId,
                type: message.type
            };
            
            // Atualizar a interface com as informações do nó
            nodeIdValue.textContent = message.nodeId;
            nodeSrcValue.textContent = message.nodeSrc;
            appIdValue.textContent = message.appId;
            typeValue.textContent = message.type;
            
            // Criar card para esta mensagem
            addMessageToTimeline(message, 'node-info');
        } 
        // Verificar se é uma mensagem de evento
        else if (message.nodeId && message.appId && message.eventType && message.action) {
            // Verificar se os IDs correspondem aos esperados
            const isValid = message.nodeId === currentNodeInfo.nodeId && 
                            message.appId === currentNodeInfo.appId;
            
            // Criar card para esta mensagem
            addMessageToTimeline(message, 'event-message', isValid);
        }
    }
    
    // Função para adicionar mensagem à linha do tempo
    function addMessageToTimeline(message, type, isValid = true) {
        // Remover estado vazio se for a primeira mensagem
        if (messageTimeline.querySelector('.empty-state')) {
            messageTimeline.innerHTML = '';
        }
        
        const messageCard = document.createElement('div');
        messageCard.className = `message-card ${!isValid ? 'invalid' : ''}`;
        
        // Criar cabeçalho com timestamp
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <span>${new Date().toLocaleTimeString()}</span>
            <span>${type === 'node-info' ? 'Informações do Nó' : 'Ação'}</span>
        `;
        
        // Criar conteúdo da mensagem
        const content = document.createElement('div');
        content.className = 'message-content';
        
        if (type === 'node-info') {
            content.innerHTML = `
                <div class="message-field">
                    <span class="field-name">nodeId:</span>
                    <span>${message.nodeId}</span>
                </div>
                <div class="message-field">
                    <span class="field-name">nodeSrc:</span>
                    <span>${message.nodeSrc}</span>
                </div>
                <div class="message-field">
                    <span class="field-name">appId:</span>
                    <span>${message.appId}</span>
                </div>
                <div class="message-field">
                    <span class="field-name">type:</span>
                    <span>${message.type}</span>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="message-field">
                    <span class="field-name">nodeId:</span>
                    <span class="${message.nodeId !== currentNodeInfo.nodeId ? 'invalid-value' : ''}">
                        ${message.nodeId} ${message.nodeId !== currentNodeInfo.nodeId ? '✗' : '✓'}
                    </span>
                </div>
                <div class="message-field">
                    <span class="field-name">appId:</span>
                    <span class="${message.appId !== currentNodeInfo.appId ? 'invalid-value' : ''}">
                        ${message.appId} ${message.appId !== currentNodeInfo.appId ? '✗' : '✓'}
                    </span>
                </div>
                ${message.label ? `
                <div class="message-field">
                    <span class="field-name">label:</span>
                    <span>${message.label}</span>
                </div>
                ` : ''}
                <div class="message-field">
                    <span class="field-name">eventType:</span>
                    <span>${message.eventType}</span>
                </div>
                <div class="message-field">
                    <span class="field-name">action:</span>
                    <span>${message.action}</span>
                </div>
            `;
        }
            
        // Adicionar evento de clique para responder
        messageCard.addEventListener('click', () => {
            selectedMessageForResponse = message;
            openResponseModal(message);
        });
        
        messageCard.appendChild(header);
        messageCard.appendChild(content);
        
        // Adicionar no início da linha do tempo (mensagens mais recentes no topo)
        messageTimeline.insertBefore(messageCard, messageTimeline.firstChild);
    }
    
    // Função para abrir o modal de resposta
    function openResponseModal(message) {
        // Pré-preencher os campos com valores da mensagem
        responseEventType.value = message.eventType || 'preparation';
        responseTransition.value = 'starts'; // Valor padrão
        responseLabel.value = message.label || '';
        
        // Mostrar o modal
        responseModal.classList.add('active');
    }
    
    // Função para fechar o modal de resposta
    function closeResponseModal() {
        responseModal.classList.remove('active');
        selectedMessageForResponse = null;
    }
    
    // Função para enviar resposta
    function sendResponse() {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            alert('WebSocket não está conectado');
            return;
        }
        
        if (!selectedMessageForResponse) {
            alert('Nenhuma mensagem selecionada para resposta');
            return;
        }
        
        // Criar objeto de resposta
        const response = {
            nodeId: selectedMessageForResponse.nodeId,
            appId: selectedMessageForResponse.appId,
            eventType: responseEventType.value,
            transition: responseTransition.value
        };
        
        // Adicionar label se existir na mensagem original ou se foi preenchido
        if (selectedMessageForResponse.label != '' || responseLabel.value) {
            response.label = responseLabel.value || selectedMessageForResponse.label;
        }
        
        // Enviar via WebSocket
        websocket.send(JSON.stringify(response));
        
        // Fechar o modal
        closeResponseModal();
        
        // Adicionar a resposta à linha do tempo (como mensagem enviada)
        addSentMessageToTimeline(response);
    }
    
    // Função para adicionar mensagem enviada à linha do tempo
    function addSentMessageToTimeline(message) {
        const messageCard = document.createElement('div');
        messageCard.className = 'message-card sent-message';
        
        const header = document.createElement('div');
        header.className = 'message-header';
        header.innerHTML = `
            <span>${new Date().toLocaleTimeString()}</span>
            <span>Evento Enviado</span>
        `;
        
        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `
            <div class="message-field">
                <span class="field-name">nodeId:</span>
                <span>${message.nodeId}</span>
            </div>
            <div class="message-field">
                <span class="field-name">appId:</span>
                <span>${message.appId}</span>
            </div>
            ${message.label ? `
            <div class="message-field">
                <span class="field-name">label:</span>
                <span>${message.label}</span>
            </div>
            ` : ''}
            <div class="message-field">
                <span class="field-name">eventType:</span>
                <span>${message.eventType}</span>
            </div>
            <div class="message-field">
                <span class="field-name">transition:</span>
                <span>${message.transition}</span>
            </div>
        `;
        
        messageCard.appendChild(header);
        messageCard.appendChild(content);
        
        // Adicionar no início da linha do tempo
        messageTimeline.insertBefore(messageCard, messageTimeline.firstChild);
    }
});