const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config.json');
const constants = require('./constants');
const fs = require('fs');
const axios = require('axios');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const ongoingRequests = new Map();

const { exec } = require('child_process');

async function getGcloudAccessToken() {
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

async function invokeLLaMA(messages, retries = 2) {
  console.log("Entering invokeLLaMA function...");

  // First, try to use the Ollama server
  try {
    await axios.get(`http://${config.OLLAMA_HOST}:11434/`, {
      timeout: 1000 // 1 second timeout for the check
    });

    // If the Ollama server is available, use it
    const ollamaData = {
      model: 'Llama-3.1-8B-Lexi-Uncensored-Q4_K_Lwget',
      stream: false,
      options: {
        num_ctx: 512
      },
      messages: [
        { role: 'system', content: constants.RAG },
        ...messages
      ]
    };

    const ollamaResponse = await axios.post(
      `http://${config.OLLAMA_HOST}:11434/api/chat`,
      ollamaData,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000 // 2 minute timeout
      }
    );

    if (ollamaResponse.data && ollamaResponse.data.message && ollamaResponse.data.message.content) {
      let content = ollamaResponse.data.message.content.replace(/\\n/g, '\n');
      return content.length > 2000 ? content.slice(0, 1997) + '...' : content;
    }
  } catch (error) {
    console.log("Ollama server is not available or encountered an error. Falling back to GCP LLaMA MaaS...");
  }

  // If Ollama is not available or fails, fall back to GCP LLaMA MaaS
  try {
    const accessToken = await getGcloudAccessToken();
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage.content;

    const response = await axios.post(
      `https://${config.ENDPOINT}/v1beta1/projects/${config.PROJECT_ID}/locations/${config.REGION}/endpoints/openapi/chat/completions`,
      {
        model: 'meta/llama3-405b-instruct-maas',
        stream: false,
        messages: [
          {
            role: 'system',
            content: constants.RAG
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const responseBody = response.data;
    console.log("LLaMA response body:", responseBody);

    if (
      responseBody &&
      responseBody.choices &&
      responseBody.choices.length > 0 &&
      responseBody.choices[0].message &&
      responseBody.choices[0].message.content
    ) {
      return responseBody.choices[0].message.content.trim();
    } else {
      console.log("Unexpected response structure:", responseBody);
      return "I'm sorry, but I received an unexpected response structure.";
    }
  } catch (error) {
    console.error('Error handling bot mention:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    return "I'm sorry, I encountered an error while processing your request.";
  }
}


function removeBotMention(content, botId) {
  return content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
}

async function getMessageChain(message, maxDepth = 10) {
  let chain = [{ role: 'user', content: removeBotMention(message.content, client.user.id) }];
  let currentMessage = message;

  while (currentMessage.reference && chain.length < maxDepth) {
    try {
      const referencedMessage = await message.channel.messages.fetch(currentMessage.reference.messageId);

      if (referencedMessage.author.bot) {
        chain.unshift({ role: 'assistant', content: referencedMessage.content });
      } else {
        chain.unshift({ role: 'user', content: removeBotMention(referencedMessage.content, client.user.id) });
      }

      currentMessage = referencedMessage;
    } catch (error) {
      console.error('Error fetching referenced message:', error);
      break;
    }
  }

  return chain;
}

client.on('messageCreate', async (message) => {
  console.log("Received a message:", message.content);
  if (message.author.bot) return;

  const isBotMentioned = message.content.startsWith(`<@${client.user.id}>`);
  const isDirectReplyToBot = message.reference && message.reference.messageId && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

  if (isBotMentioned || isDirectReplyToBot) {
    // Check if there's an ongoing request for this user
    if (ongoingRequests.has(message.author.id)) {
      console.log(`Ongoing request for user ${message.author.id}. Ignoring new request.`);
      await message.reply("I'm still processing your previous request. Please wait.");
      return;
    }

    // Set the ongoing request flag for this user
    ongoingRequests.set(message.author.id, true);


    let feedbackMessage;
    try {
      console.log("Sending instant feedback...");
      feedbackMessage = await message.reply("On it...");

      console.log("Getting message chain...");
      const messageChain = await getMessageChain(message);
      console.log("Message chain:", messageChain);

      console.log("Invoking LLaMA...");
      const llamaResponse = await invokeLLaMA(messageChain);
      console.log("LLaMA response:", llamaResponse);

      console.log("Sending LLaMA's response...");
      await message.reply(llamaResponse);
      console.log("LLaMA's response sent successfully.");

    } catch (error) {
      console.error('Error handling bot mention:', error);

      if (error.response && error.response.status === 429) {
        console.log("Rate limited: HTTP 429");
        await message.reply("You guys are being rate limited, slow down");
      } else {
        try {
          await message.reply("I'm sorry, I encountered an unexpected error while processing your message.");
          console.log("Error message sent to user.");
        } catch (replyError) {
          console.error('Error sending error message:', replyError);
        }
      }
    } finally {
      // Clear the ongoing request flag for this user
      ongoingRequests.delete(message.author.id);

      if (feedbackMessage) {
        try {
          console.log("Deleting instant feedback message...");
          await feedbackMessage.delete();
          console.log("Feedback message deleted successfully.");
        } catch (deleteError) {
          console.error('Error deleting feedback message:', deleteError);
        }
      }
    }
  }
});


client.login(config.token).then(() => {
  console.log('Bot has logged in successfully.');
}).catch((error) => {
  console.error('Error logging in:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Script has reached the end. Waiting for events...');