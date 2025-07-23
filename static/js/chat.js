// Ten Minute School Chat Interface (agentic RAG, streaming, context window)

class TenMinChatInterface {
    constructor() {
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.chatMessages = document.getElementById('chatMessages');
        this.bottomInputContainer = document.getElementById('bottomInputContainer');
        this.mainInput = document.getElementById('mainInput');
        this.bottomInput = document.getElementById('bottomInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.bottomSendBtn = document.getElementById('bottomSendBtn');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.scrollToTop = document.getElementById('scrollToTop');
        this.statusMessage = document.getElementById('statusMessage');

        this.currentMode = 'welcome';
        this.messageHistory = [];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateGreeting();
        this.adjustTextareaHeight();
        this.checkVectorDBStatus();
    }

    async checkVectorDBStatus() {
        try {
            const response = await fetch('/api/vector_db_status');
            const data = await response.json();
            if (!data.exists) {
                this.showStatus('Knowledge base not found. Please create it in Admin panel first!', '#ff5252');
                this.disableChatInputs(true);
            } else {
                this.disableChatInputs(false);
            }
        } catch (err) {
            this.showStatus('Network error. Please try again!', '#ff5252');
            this.disableChatInputs(true);
        }
    }

    disableChatInputs(isDisabled) {
        this.mainInput.disabled = isDisabled;
        this.bottomInput.disabled = isDisabled;
        this.sendBtn.disabled = isDisabled;
        this.bottomSendBtn.disabled = isDisabled;
    }

    showStatus(msg, color = "#ffd700") {
        if (!this.statusMessage) return;
        this.statusMessage.style.display = "block";
        this.statusMessage.textContent = msg;
        this.statusMessage.style.color = color;
        setTimeout(() => {
            if (this.statusMessage) this.statusMessage.style.display = "none";
        }, 4000);
    }

    setupEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage('main'));
        this.bottomSendBtn.addEventListener('click', () => this.sendMessage('bottom'));
        this.mainInput.addEventListener('keydown', (e) => this.handleKeyPress(e, 'main'));
        this.bottomInput.addEventListener('keydown', (e) => this.handleKeyPress(e, 'bottom'));
        this.mainInput.addEventListener('input', () => this.handleInputChange('main'));
        this.bottomInput.addEventListener('input', () => this.handleInputChange('bottom'));
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => this.startNewChat());
        }
        if (this.scrollToTop) {
            this.scrollToTop.addEventListener('click', () => this.scrollToTopOfChat());
        }
        document.addEventListener('click', (e) => {
            if (e.target.closest('.chat-item')) {
                this.selectChatItem(e.target.closest('.chat-item'));
            }
        });
        document.addEventListener('click', (e) => {
            if (e.target.closest('.capability-tag')) {
                this.handleCapabilityClick(e.target.closest('.capability-tag'));
            }
        });
        this.mainInput.addEventListener('input', () => this.adjustTextareaHeight(this.mainInput));
        this.bottomInput.addEventListener('input', () => this.adjustTextareaHeight(this.bottomInput));
        window.addEventListener('resize', () => this.handleResize());
        document.addEventListener('click', (e) => {
            if (
                window.innerWidth <= 768 &&
                !this.sidebar.contains(e.target) &&
                !this.sidebarToggle.contains(e.target) &&
                this.sidebar.classList.contains('open')
            ) {
                this.toggleSidebar();
            }
        });
    }

    updateGreeting() {
        const greeting = document.querySelector('.greeting');
        const currentHour = new Date().getHours();
        let timeGreeting;
        if (currentHour < 12) {
            timeGreeting = 'Good morning';
        } else if (currentHour < 18) {
            timeGreeting = 'Good afternoon';
        } else {
            timeGreeting = 'Good evening';
        }
        greeting.textContent = `${timeGreeting}, How can I assist you today?`;
    }

    handleKeyPress(e, inputType) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage(inputType);
        }
    }

    handleInputChange(inputType) {
        const input = inputType === 'main' ? this.mainInput : this.bottomInput;
        const sendBtn = inputType === 'main' ? this.sendBtn : this.bottomSendBtn;
        const hasText = input.value.trim().length > 0;
        sendBtn.disabled = !hasText || input.disabled;
        this.adjustTextareaHeight(input);
    }

    adjustTextareaHeight(textarea = null) {
        const inputs = textarea ? [textarea] : [this.mainInput, this.bottomInput];
        inputs.forEach(input => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
    }

    async sendMessage(inputType) {
        const input = inputType === 'main' ? this.mainInput : this.bottomInput;
        const text = input.value.trim();
        if (!text || input.disabled) return;

        if (this.currentMode === 'welcome') {
            this.switchToConversationMode();
        }

        this.addMessage(text, 'user');
        input.value = '';
        this.handleInputChange(inputType);

        // Show AI typing indicator
        const typingDiv = this.addTypingIndicator();

        // Prepare chat history for context window (last 6 turns)
        const history = this.getChatHistory();

        // Streaming response from backend
        try {
            const response = await fetch('/api/chat', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ history })
            });

            if (!response.ok || !response.body) throw new Error("Backend error");

            let aiMessage = '';
            const reader = response.body.getReader();
            let done = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    const chunk = new TextDecoder().decode(value);
                    aiMessage += chunk;
                    if (typingDiv && typingDiv.querySelector('.message-content')) {
                        typingDiv.querySelector('.message-content').innerHTML =
                            `<div class="message-text">${this.formatMessage(aiMessage)}</div>`;
                    }
                }
            }
            // After streaming is done, show final message
            if (typingDiv) typingDiv.remove();
            this.addMessage(aiMessage, 'ai');
            this.messageHistory.push({
                text: aiMessage,
                sender: 'ai',
                timestamp: new Date().toISOString()
            });

        } catch (err) {
            if (typingDiv) typingDiv.remove();
            this.showStatus("Error: Could not get answer. Try again!", "#ff5252");
        }
    }

    getChatHistory() {
        // Return last 6 rounds as [{role: "user"/"assistant", content: "..."}]
        const filtered = this.messageHistory
            .filter(msg => msg.sender === 'user' || msg.sender === 'ai')
            .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            }));
        return filtered.slice(-6);
    }

    switchToConversationMode() {
        this.currentMode = 'conversation';
        this.welcomeScreen.style.display = 'none';
        this.chatMessages.style.display = 'block';
        this.bottomInputContainer.style.display = 'block';
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        let avatarContent;
        let messageClass = 'message ' + (sender === 'user' ? 'user' : 'ai');
        if (sender === 'ai-context') {
            messageClass += ' ai-context';
            avatarContent = 'Q';
        } else {
            avatarContent = sender === 'user' ? 'T' : 'Q';
        }
        messageDiv.className = messageClass;
        messageDiv.innerHTML = `
            <div class="message-avatar">${avatarContent}</div>
            <div class="message-content">
                <div class="message-text">${this.formatMessage(text)}</div>
                ${sender === 'ai' ? this.createMessageActions() : ''}
            </div>
        `;
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        if (sender !== 'ai-context') {
            this.messageHistory.push({
                text,
                sender,
                timestamp: new Date().toISOString()
            });
        }
        if (this.messageHistory.length === 1) {
            this.updateCurrentChatTitle(text);
        }
    }

    formatMessage(text) {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background:#f3f4f6;padding:2px 4px;border-radius:4px;">$1</code>')
            .replace(/\n/g, '<br>');
    }

    createMessageActions() {
        return `
            <div class="message-actions">
                <button class="message-action" title="Copy">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="message-action" title="Like">
                    <i class="fas fa-thumbs-up"></i>
                </button>
                <button class="message-action" title="Dislike">
                    <i class="fas fa-thumbs-down"></i>
                </button>
                <button class="message-action" title="Regenerate">
                    <i class="fas fa-redo"></i>
                </button>
            </div>
        `;
    }

    addTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">Q</div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        if (!document.querySelector('#typing-styles')) {
            const style = document.createElement('style');
            style.id = 'typing-styles';
            style.textContent = `
                .typing-dots {
                    display: flex;
                    gap: 4px;
                    align-items: center;
                    padding: 8px 0;
                }
                .typing-dots span {
                    width: 6px;
                    height: 6px;
                    background: #9ca3af;
                    border-radius: 50%;
                    animation: typing 1.4s infinite ease-in-out;
                }
                .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
                .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
                @keyframes typing {
                    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
        return typingDiv;
    }

    scrollToBottom() {
        requestAnimationFrame(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        });
    }

    scrollToTopOfChat() {
        this.chatMessages.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    toggleSidebar() {
        this.sidebar.classList.toggle('open');
    }

    startNewChat() {
        this.currentMode = 'welcome';
        this.messageHistory = [];
        this.welcomeScreen.style.display = 'flex';
        this.chatMessages.style.display = 'none';
        this.bottomInputContainer.style.display = 'none';
        this.chatMessages.innerHTML = '';
        this.mainInput.value = '';
        this.bottomInput.value = '';
        this.handleInputChange('main');
        this.handleInputChange('bottom');
        this.addNewChatToSidebar();
        if (window.innerWidth <= 768) {
            this.sidebar.classList.remove('open');
        }
    }

    addNewChatToSidebar() { }

    updateCurrentChatTitle(firstMessage) { }

    selectChatItem(chatItem) {
        if (window.innerWidth <= 768) {
            this.sidebar.classList.remove('open');
        }
    }

    handleCapabilityClick(capabilityTag) {
        const text = capabilityTag.textContent.trim();
        const prompts = {
            'Web Dev': 'Help me build a modern web application',
            'Deep Research': 'I need help with research on artificial intelligence',
            'Image Generation': 'Generate an image of a futuristic cityscape',
            'Video Generation': 'Create a video about renewable energy',
            'Artifacts': 'Show me an interactive component example'
        };
        const prompt = prompts[text];
        if (prompt) {
            const activeInput = this.currentMode === 'welcome' ? this.mainInput : this.bottomInput;
            activeInput.value = prompt;
            this.handleInputChange(this.currentMode === 'welcome' ? 'main' : 'bottom');
            activeInput.focus();
        }
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.sidebar.classList.remove('open');
        }
    }
}

// Initialize the chat interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new TenMinChatInterface();
});

// Add copy functionality for message actions
document.addEventListener('click', (e) => {
    if (e.target.closest('.message-action')) {
        const action = e.target.closest('.message-action');
        const icon = action.querySelector('i');
        if (icon.classList.contains('fa-copy')) {
            const messageContent = action.closest('.message-content').querySelector('.message-text');
            const textToCopy = messageContent.textContent;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalIcon = icon.className;
                icon.className = 'fas fa-check';
                setTimeout(() => {
                    icon.className = originalIcon;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    }
});