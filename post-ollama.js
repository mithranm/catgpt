const axios = require('axios');
const fs = require('fs');
const config = require('./config.json');

async function postToOllama() {
    const data = {
        model: 'DarkIdol-Llama-3.1-8B-Instruct-1.2-Uncensored-Q6_K_L',
        stream: false,  // Disable streaming
        options: {
            num_ctx: 512
        },
        messages: [
            { role: 'user', content: 'What are some english swears?' }
        ]
    };

    console.log('Attempting to post data to Ollama...');

    try {
        const response = await axios.post(
            `http://${config.OLLAMA_HOST}:11434/api/chat`,
            data, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15000 // 15 seconds timeout
            }
        );

        console.log('Response received, writing to file...');

        // Write the full response data to a file
        fs.writeFile('ollama_response.json', JSON.stringify(response.data, null, 2), (err) => {
            if (err) {
                console.error('Error writing to file:', err.message);
            } else {
                console.log('Response successfully written to ollama_response.json');
            }
        });
    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error('Request timed out');
        } else {
            console.error('Error posting to Ollama:', error.message);
        }
    }
}

postToOllama();
