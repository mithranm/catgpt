const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('./config.json');
const axios = require('axios');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

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

async function invokeLLaMA(prompt, retries = 2) {
  console.log("Entering invokeLLaMA function...");
  const accessToken = await getGcloudAccessToken();

  const response = await axios.post(
    `https://${config.ENDPOINT}/v1beta1/projects/${config.PROJECT_ID}/locations/${config.REGION}/endpoints/openapi/chat/completions`,
    {
      model: 'meta/llama3-405b-instruct-maas',
      stream: false,
      max_tokens: 512, // You can adjust this to control response length
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  let result = '';

  if (response.data && response.data.choices) {
    result = response.data.choices.map(choice => choice.message.content).join('\n');
  } else {
    result = response.data;
  }

  // Replace escaped newline characters with actual newlines
  result = result.replace(/\\n/g, '\n');

  // Truncate the result to 2000 characters
  if (result.length > 2000) {
    result = result.slice(0, 2000 - 3) + '...'; // Truncate and add ellipsis
  }

  console.log("Processed LLaMA response:", result);

  return result;
}


client.on('messageCreate', async (message) => {
  console.log("Received a message:", message.content);
  if (message.author.bot) return;

  // Check if the bot's user ID or role is mentioned
  const isBotMentioned = message.mentions.has(client.user.id);
  const botRole = message.guild.roles.cache.find(role => role.name === 'CatGPT');
  const isRoleMentioned = botRole && message.mentions.roles.has(botRole.id);

  if (isBotMentioned || isRoleMentioned) {
    try {
      console.log("Sending instant feedback...");
      const feedbackMessage = await message.reply("On it...");

      console.log("Invoking LLaMA...");
      const llamaResponse = await invokeLLaMA(message.content);
      console.log("LLaMA response:", llamaResponse);
      
      if (llamaResponse) {
        console.log("Sending LLaMA's response...");
        await message.reply(llamaResponse);
        console.log("LLaMA's response sent successfully.");
      } else {
        console.log("LLaMA didn't generate a response. Sending default message...");
        await message.reply("I'm sorry, I couldn't generate a response at this time.");
        console.log("Default message sent successfully.");
      }

      console.log("Deleting instant feedback message...");
      await feedbackMessage.delete();
      console.log("Feedback message deleted successfully.");
    } catch (error) {
      console.error('Error handling bot mention:', error);
      try {
        await message.reply("I'm sorry, I encountered an error while processing your message.");
        console.log("Error message sent to user.");
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  } else if (message.reference && message.reference.messageId) {
    try {
      console.log("Fetching replied message...");
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
      
      if (repliedTo.author.id === client.user.id) {
        console.log(`Someone replied to our message! They said: ${message.content}`);
        
        console.log("Sending instant feedback...");
        const feedbackMessage = await message.reply("On it...");

        console.log("Invoking LLaMA...");
        const llamaResponse = await invokeLLaMA(message.content);
        console.log("LLaMA response:", llamaResponse);
        
        if (llamaResponse) {
          console.log("Sending LLaMA's response...");
          await message.reply(llamaResponse);
          console.log("LLaMA's response sent successfully.");
        } else {
          console.log("LLaMA didn't generate a response. Sending default message...");
          await message.reply("I'm sorry, I couldn't generate a response at this time.");
          console.log("Default message sent successfully.");
        }

        console.log("Deleting instant feedback message...");
        await feedbackMessage.delete();
        console.log("Feedback message deleted successfully.");
      } else {
        console.log("The replied message was not our message or not from our bot.");
      }
    } catch (error) {
      console.error('Error handling reply:', error);
      try {
        await message.reply("I'm sorry, I encountered an error while processing your message.");
        console.log("Error message sent to user.");
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
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
