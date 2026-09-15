import fetch from 'node-fetch';

export async function handler(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { message } = JSON.parse(event.body);
        const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;

        if (!NVIDIA_API_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Chave da API da NVIDIA não configurada no Netlify.' }) };
        }

        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${NVIDIA_API_KEY}`,
                "Accept": "application/json"
            },
            body: JSON.stringify({
                model: "moonshotai/kimi-k3",
                messages: [
                    { role: "user", content: message }
                ],
                max_tokens: 16384,
                temperature: 1,
                reasoning_effort: "max",
                stream: false
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || 'Erro na API da NVIDIA' }) };
        }

        const reply = data.choices[0].message.content;

        return {
            statusCode: 200,
            body: JSON.stringify({ reply })
        };

    } catch (error) {
        console.error('Erro na Netlify Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Erro interno no servidor.' })
        };
    }
};