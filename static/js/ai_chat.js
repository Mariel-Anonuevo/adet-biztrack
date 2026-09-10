/**
 * ai_chat.js
 * Global AI Chat Assistant interface controller for BizTrack.
 */

document.addEventListener('DOMContentLoaded', () => {
    const chatWidget   = document.getElementById('globalAiChatWidget');
    const chatFab      = document.getElementById('globalAiFab');
    const closeBtn     = document.getElementById('btnCloseGlobalAi');
    const clearBtn     = document.getElementById('btnClearGlobalAi');
    const sendBtn      = document.getElementById('btnSendGlobalAi');
    const chatInput    = document.getElementById('globalAiInput');
    const messagesArea = document.getElementById('globalAiChatMessages');

    const STORAGE_KEY = 'biztrack_ai_chat_history';
    const DEFAULT_GREETING = 'Hello! I am your BizTrack AI assistant. Ask me anything about your business metrics, trends, or predictions!';

    if (!chatWidget || !chatFab) return;

    // Load conversation history on startup
    loadChatHistory();

    // Toggle Chat via FAB
    chatFab.addEventListener('click', () => {
        chatWidget.classList.toggle('d-none');
        if (!chatWidget.classList.contains('d-none')) {
            chatInput.focus();
            scrollChatToBottom();
        }
    });

    // Close Chat
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            chatWidget.classList.add('d-none');
        });
    }

    // Clear Chat History
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const confirmClear = await showConfirm(
                'Are you sure you want to clear your AI chat conversation history?',
                'Clear Chat History'
            );
            if (confirmClear) {
                localStorage.removeItem(STORAGE_KEY);
                messagesArea.innerHTML = `
                    <div class="ai-msg p-2 mb-2 rounded w-75 text-white">
                        ${DEFAULT_GREETING}
                    </div>
                `;
                showAlert('Your AI chat conversation history has been cleared.', 'History Cleared', 'success');
            }
        });
    }

    // Toggle Chat via page header "AI Active" buttons
    // Since some headers are dynamically rendered or loaded, we handle it on load and delegate click events
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.btn-ai-badge') || e.target.closest('#aiBadge');
        if (target) {
            e.preventDefault();
            chatWidget.classList.remove('d-none');
            chatInput.focus();
            scrollChatToBottom();
        }
    });

    // Send Message on click
    if (sendBtn) {
        sendBtn.addEventListener('click', sendGlobalAiMessage);
    }

    // Send Message on Enter
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendGlobalAiMessage();
            }
        });
    }

    async function sendGlobalAiMessage() {
        const question = chatInput.value.trim();
        if (!question) return;

        // Render User Message
        appendMessage(question, 'user');
        chatInput.value = '';
        scrollChatToBottom();

        // Show AI Typing Indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-msg p-2 mb-2 rounded w-75 typing-indicator';
        typingDiv.innerHTML = `<span class="spinner-grow spinner-grow-sm" role="status" aria-hidden="true"></span> Thinking...`;
        messagesArea.appendChild(typingDiv);
        scrollChatToBottom();

        try {
            const response = await authFetch('/sales/api/ask-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });

            // Remove Typing Indicator
            typingDiv.remove();

            if (!response.ok) {
                throw new Error('Could not get response from AI');
            }

            const data = await response.json();
            appendMessage(data.reply, 'ai');
        } catch (error) {
            console.error('AI Chat Error:', error);
            typingDiv.remove();
            appendMessage('Sorry, I encountered an error connecting to the AI helper. Please try again.', 'ai');
        } finally {
            scrollChatToBottom();
        }
    }

    function formatMarkdown(text) {
        if (!text) return "";
        let html = text;

        // Escape HTML to prevent XSS
        html = html
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

        // Bold: **text**
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Italic: *text* or _text_
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
        html = html.replace(/_(.*?)_/g, "<em>$1</em>");

        // Numbered lists: 1. text
        html = html.replace(/(?:^|\n)(\d+)\.\s+(.*?)(?=\n|$)/g, '<div class="d-flex align-items-start gap-1 mt-1 mb-1 ms-2"><span class="fw-bold">$1.</span><span>$2</span></div>');

        // Bullet points: - text or * text
        html = html.replace(/(?:^|\n)[-*+]\s+(.*?)(?=\n|$)/g, '<div class="d-flex align-items-start gap-2 mt-1 mb-1 ms-2"><span class="text-success">&bull;</span><span>$1</span></div>');

        // Remaining newlines: \n -> <br> (if not inside the list item wrapper tags)
        // To be safe, we only replace newlines that aren't adjacent to divs
        html = html.replace(/\n/g, "<br>");

        return html;
    }

    function loadChatHistory() {
        try {
            const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (history.length > 0) {
                messagesArea.innerHTML = '';
                history.forEach(msg => {
                    appendMessage(msg.text, msg.sender, false);
                });
                scrollChatToBottom();
            }
        } catch (e) {
            console.error('Error loading chat history:', e);
        }
    }

    function appendMessage(text, sender, saveToHistory = true) {
        const msgDiv = document.createElement('div');
        msgDiv.className = sender === 'user' 
            ? 'user-msg p-2 mb-2 rounded w-75' 
            : 'ai-msg p-2 mb-2 rounded w-75 text-white';
        
        if (sender === 'ai') {
            msgDiv.innerHTML = formatMarkdown(text);
        } else {
            msgDiv.innerText = text;
        }
        
        messagesArea.appendChild(msgDiv);

        if (saveToHistory) {
            try {
                const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                history.push({ text, sender });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
            } catch (e) {
                console.error('Error saving chat message:', e);
            }
        }
    }

    function scrollChatToBottom() {
        if (messagesArea) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
        }
    }
});
