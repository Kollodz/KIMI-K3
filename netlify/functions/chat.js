const fetch = require('node-fetch');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { message } = JSON.parse(event.body);
        const apiKey = process.env.NVIDIA_API_KEY;

        if (!apiKey) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'NVIDIA_API_KEY não configurada no Netlify.' })
            };
        }

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "moonshotai/kimi-k3",
                messages: [
                    { role: "system", content: "Você é um assistente prestativo." },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 512,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Erro na API NVIDIA: ${errorText}` })
            };
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || 'Sem resposta.';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reply })
        };

    } catch (error) {
        console.error('Erro na Netlify Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};