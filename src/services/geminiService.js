const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    }

    async generateResponse(systemPrompt, userMessage, context = '') {
        try {
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                }
            });

            // Combine system prompt, context, and user message
            const fullPrompt = `${systemPrompt}\n\nContext:\n${context}\n\nUser Question: ${userMessage}`;

            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            
            return response.text();
        } catch (error) {
            console.error('Error generating response with Gemini:', error.message);
            throw error;
        }
    }

    async generateChat(messages, systemPrompt = null) {
        try {
            const model = this.genAI.getGenerativeModel({ 
                model: this.model,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                }
            });

            // Convert messages to Gemini format
            let prompt = '';
            if (systemPrompt) {
                prompt += `System: ${systemPrompt}\n\n`;
            }

            messages.forEach(msg => {
                prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
            });

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            return response.text();
        } catch (error) {
            console.error('Error generating chat with Gemini:', error.message);
            throw error;
        }
    }

    async checkHealth() {
        try {
            const model = this.genAI.getGenerativeModel({ model: this.model });
            const result = await model.generateContent('Hello');
            return { status: 'healthy', model: this.model };
        } catch (error) {
            console.error('Gemini health check failed:', error.message);
            return { status: 'error', error: error.message };
        }
    }
}

module.exports = { GeminiService };
