(function() {
    const SUPABASE_URL = 'https://spsfpprikqmmmsbpmgxd.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwc2ZwcHJpa3FtbW1zYnBtZ3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzY4MTAsImV4cCI6MjEwNTA1MjgxMH0.mt7KxkcMdNG5aiO0EEDL3XAtGv532_F8pquwx3_STKU';
    const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    let currentConversationId = null;

    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const historyList = document.getElementById('history-list');

    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    newChatBtn.addEventListener('click', startNewChat);

    async function startNewChat() {
        try {
            const { data, error } = await supabaseClient
                .from('conversations')
                .insert([{ title: 'Nova Conversa' }])
                .select()
                .single();

            if (error) throw error;
            
            currentConversationId = data.id;
            clearChatUI();
            loadConversationsHistory();
        } catch (err) {
            console.error('Erro ao criar nova conversa:', err);
            currentConversationId = 'local-' + Date.now();
            clearChatUI();
        }
    }

    function clearChatUI() {
        chatContainer.innerHTML = `
            <div id="welcome-screen" class="text-center text-gray-500 mt-32 max-w-lg mx-auto">
                <h1 class="text-3xl font-semibold text-gray-200 mb-2">Como posso ajudar você hoje?</h1>
                <p class="text-sm text-gray-400">Inicie uma conversa abaixo com o Kimi-k3.</p>
            </div>
        `;
    }

    sendBtn.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    async function handleSendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        if (!currentConversationId) {
            await startNewChat();
        }

        const welcome = document.getElementById('welcome-screen');
        if (welcome) {
            welcome.remove();
        }

        userInput.value = '';
        userInput.style.height = 'auto';

        appendMessage('user', text);
        await saveMessageToSupabase(currentConversationId, 'user', text);

        const loadingId = appendLoadingMessage();

        try {
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: currentConversationId,
                    message: text
                })
            });

            const responseText = await response.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error('O servidor retornou uma resposta inválida (Timeout ou erro de gateway).');
            }

            const loadingElem = document.getElementById(loadingId);
            if (loadingElem) loadingElem.remove();

            if (!response.ok || data.error) throw new Error(data.error || 'Erro desconhecido');

            appendMessage('assistant', data.reply);
            await saveMessageToSupabase(currentConversationId, 'assistant', data.reply);
            updateConversationTitleIfNeeded(text);

        } catch (error) {
            console.error('Erro:', error);
            const loadingElem = document.getElementById(loadingId);
            if (loadingElem) loadingElem.remove();
            appendMessage('assistant', 'Erro: ' + error.message);
        }
    }

    function appendMessage(role, content) {
        const isUser = role === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'} w-full`;
        
        const innerBubble = document.createElement('div');
        innerBubble.className = `max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser 
                ? 'bg-amber-600 text-white rounded-br-xs' 
                : 'bg-gray-800 text-gray-200 rounded-bl-xs border border-gray-700/50 shadow-sm'
        }`;

        if (isUser) {
            innerBubble.textContent = content;
        } else {
            const safeContent = content || '';
            if (typeof marked !== 'undefined') {
                innerBubble.innerHTML = marked.parse(safeContent);
            } else {
                innerBubble.textContent = safeContent;
            }
        }

        msgDiv.appendChild(innerBubble);
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    function appendLoadingMessage() {
        const loadingId = 'loading-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.id = loadingId;
        msgDiv.className = 'flex justify-start w-full';
        
        msgDiv.innerHTML = `
            <div class="max-w-xl rounded-2xl px-4 py-3 bg-gray-800 text-gray-400 text-sm border border-gray-700/50 flex items-center gap-2">
                <div class="w-2 h-2 bg-amber-500 rounded-full animate-bounce"></div>
                <div class="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-.2s]"></div>
                <div class="w-2 h-2 bg-amber-500 rounded-full animate-bounce [animation-delay:-.4s]"></div>
            </div>
        `;
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return loadingId;
    }

    async function saveMessageToSupabase(convId, role, content) {
        if (convId.toString().startsWith('local-')) return;
        await supabaseClient.from('messages').insert([
            { conversation_id: convId, role: role, content: content }
        ]);
    }

    async function loadConversationsHistory() {
        const { data, error } = await supabaseClient
            .from('conversations')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) return;

        historyList.innerHTML = '';
        data.forEach(conv => {
            const btn = document.createElement('button');
            btn.className = `w-full text-left px-3 py-2 rounded-lg truncate text-xs transition ${
                conv.id === currentConversationId ? 'bg-gray-800 text-gray-200 font-medium' : 'hover:bg-gray-900 text-gray-400'
            }`;
            btn.textContent = conv.title || 'Nova Conversa';
            btn.onclick = () => loadConversation(conv.id);
            historyList.appendChild(btn);
        });
    }

    async function loadConversation(convId) {
        currentConversationId = convId;
        clearChatUI();

        const { data, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true });

        if (error) return;

        const welcome = document.getElementById('welcome-screen');
        if (welcome && data.length > 0) welcome.remove();

        data.forEach(msg => {
            appendMessage(msg.role, msg.content);
        });
        
        loadConversationsHistory();
    }

    async function updateConversationTitleIfNeeded(firstMessage) {
        if (currentConversationId.toString().startsWith('local-')) return;
        const title = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        await supabaseClient
            .from('conversations')
            .update({ title: title })
            .eq('id', currentConversationId);
        
        loadConversationsHistory();
    }

    loadConversationsHistory();
})();