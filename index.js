const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config.json');
const awscredentials = require('./awscredentials.json')
const reminder = 'Remember to shower after your valo session!'
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

console.log("Access Key ID:", awscredentials.accessKeyId.substring(0, 5) + "...");
console.log("Secret Access Key is set:", !!awscredentials.secretAccessKey);

const bedrockClient = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: awscredentials.accessKeyId,
    secretAccessKey: awscredentials.secretAccessKey
  },
});

async function invokeClaude(prompt, retries = 2) {
  console.log("Entering invokeClaude function...");
  const params = {
    modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: "You are an AI assistant that has just sent a reminder to a user about showering after their gaming session. Respond to their reply in a friendly and encouraging manner."
        },
        {
          role: "assistant",
          content: reminder
        },
        {
          role: "user",
          content: prompt
        }
      ]
    }),
  };

  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Attempt ${i + 1}: Sending request to Claude...`);
      const command = new InvokeModelCommand(params);
      const response = await bedrockClient.send(command);
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      console.log("Claude response body:", responseBody);

      if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
        return responseBody.content[0].text.trim();
      } else {
        console.log("Unexpected response structure:", responseBody);
        return "I'm sorry, but I received an unexpected response structure.";
      }
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) {
        return "Sorry, I encountered an error while processing your request after multiple attempts.";
      }
    }
  }
}

client.on('messageCreate', async (message) => {
  console.log("Received a message:", message.content);
  if (message.author.bot) return;

  if (message.content.includes('<@&845873650876022824>')) {
    try {
      console.log("Sending reminder...");
      await message.reply(reminder);
      console.log("Reminder sent successfully.");
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  } else if (message.reference && message.reference.messageId) {
    try {
      console.log("Fetching replied message...");
      const repliedTo = await message.channel.messages.fetch(message.reference.messageId);
      
      if (repliedTo.author.id === client.user.id && repliedTo.content === reminder) {
        console.log(`Someone replied to our reminder! They said: ${message.content}`);
        
        console.log("Invoking Claude...");
        const claudeResponse = await invokeClaude(message.content);
        console.log("Claude response:", claudeResponse);
        
        if (claudeResponse) {
          console.log("Sending Claude's response...");
          await message.reply(claudeResponse);
          console.log("Claude's response sent successfully.");
        } else {
          console.log("Claude didn't generate a response. Sending default message...");
          await message.reply("I'm sorry, I couldn't generate a response at this time.");
          console.log("Default message sent successfully.");
        }
      } else {
        console.log("The replied message was not our reminder or not from our bot.");
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