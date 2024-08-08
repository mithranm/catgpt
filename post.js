const axios = require('axios');
const { exec } = require('child_process');
const config = require('./config');

function getGcloudAccessToken() {
  return new Promise((resolve, reject) => {
    exec('gcloud auth print-access-token', (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function generateResponse(prompt) {
  try {
    const ACCESS_TOKEN = await getGcloudAccessToken();

    const response = await axios.post(
      `https://${config.ENDPOINT}/v1beta1/projects/${config.PROJECT_ID}/locations/${config.REGION}/endpoints/openapi/chat/completions`,
      {
        model: 'meta/llama3-405b-instruct-maas',
        stream: false, // Turn off streaming
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Since streaming is off, assume the response is a single object
    let result = '';

    if (response.data && response.data.choices) {
      result = response.data.choices.map(choice => choice.message.content).join('\n');
    } else {
      result = response.data; // Handle unexpected structure
    }

    return result;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example usage
const prompt = 'About how many tokens is 2000 characters?';
generateResponse(prompt)
  .then((response) => {
    console.log(response);
  })
  .catch((error) => {
    console.error('Error:', error);
  });
