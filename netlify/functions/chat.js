exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const bodyData = JSON.parse(event.body);
        const { message, fileType, fileData } = bodyData;

        // 1. PASSO DE ORQUESTRAÇÃO: O GPT analisa a intenção e decide a melhor IA
        const gptApiKey = process.env.GPT_API_KEY;
        if (!gptApiKey) {
            return { statusCode: 500, body: JSON.stringify({ error: 'GPT_API_KEY não configurada no Netlify.' }) };
        }

        // Se o usuário mandou imagem, o orquestrador obrigatoriamente direciona para o Llama Vision
        let targetAgent = "gemma"; // Padrão para conversas gerais
        if (fileType && fileType.startsWith('image/')) {
            targetAgent = "llama";
        } else if (fileType === 'code' || (message && (message.includes('.py') || message.includes('.js') || message.includes('.html') || message.includes('código')))) {
            targetAgent = "deepseek";
        } else {
            // Pergunta rápida ao GPT Orquestrador para classificar a intenção textual
            const routerPrompt = `Analise a mensagem do usuário e escolha qual agente especializado deve responder. 
            Opções permitidas (responda APENAS com uma delas):
            - "deepseek" (para programação, refatoração de código, lógica avançada)
            - "kimi" (para tarefas complexas de contexto longo, análise de documentos ou agenticas)
            - "gemma" (para conversas gerais, explicações didáticas, escrita e textos)
            
            Mensagem: "${message}"`;

            const routerRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gptApiKey}` },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [{ role: "user", content: routerPrompt }],
                    max_tokens: 10,
                    temperature: 0
                })
            });

            if (routerRes.ok) {
                const routerData = await routerRes.json();
                const decision = routerData.choices?.[0]?.message?.content?.trim().toLowerCase();
                if (decision && ['deepseek', 'kimi', 'gemma'].includes(decision)) {
                    targetAgent = decision;
                }
            }
        }

        // 2. CONFIGURAÇÃO DO AGENTE ESCOLHIDO PELO ORQUESTRADOR
        let selectedModel = "";
        let apiKey = "";
        let userContent = message;
        let extraPayload = {};

        switch (targetAgent) {
            case "deepseek":
                selectedModel = "deepseek-ai/deepseek-v4-flash-0731";
                apiKey = process.env.DEEP_API_KEY;
                extraPayload = {
                    "extra_body": { "chat_template_kwargs": { "thinking": true, "reasoning_effort": "high" } },
                    "top_p": 0.95
                };
                break;
            case "kimi":
                selectedModel = "moonshotai/kimi-k3";
                apiKey = process.env.kimi_API_KEY;
                break;
            case "llama":
                selectedModel = "meta/llama-3.2-90b-vision-instruct";
                apiKey = process.env.LLAMA_API_KEY;
                userContent = [
                    { "type": "image_url", "image_url": { "url": fileData } },
                    { "type": "text", "text": message || "Analise esta imagem." }
                ];
                break;
            case "gemma":
            default:
                selectedModel = "google/gemma-4-31b-it";
                apiKey = process.env.GEMMA_API_KEY;
                break;
        }

        if (!apiKey) {
            // Fallback para a chave do GPT caso a específica não esteja mapeada
            apiKey = gptApiKey; 
        }

        // 3. EXECUÇÃO DA REQUISIÇÃO NO MODELO SELECIONADO
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: "system", content: "Você é um assistente especialista avançado em uma interface multi-agente." },
                    { role: "user", content: userContent }
                ],
                temperature: 0.7,
                max_tokens: 1024,
                stream: false,
                ...extraPayload
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Erro na API (${selectedModel}): ${errorText}` })
            };
        }

        const data = await response.json();
        const messageObj = data.choices?.[0]?.message;
        let reply = messageObj?.content || 'Sem resposta.';
        
        const reasoning = messageObj?.reasoning || messageObj?.reasoning_content;
        if (reasoning) {
            reply = `> **Raciocínio (${targetAgent.toUpperCase()}):**\n> ${reasoning.replace(/\n/g, '\n> ')}\n\n---\n\n${reply}`;
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reply, agentUsed: targetAgent, modelUsed: selectedModel })
        };

    } catch (error) {
        console.error('Erro na Netlify Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};