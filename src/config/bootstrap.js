const { Client, Collection, GatewayIntentBits, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./env");

function getAllJsFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllJsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.js')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

async function syncCommands({ token, clientId, guildId }, commands) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((command) => command.data.toJSON());

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
      console.log(`Synced ${body.length} guild command(s) to ${guildId}.`);
      return;
    }

    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log(`Synced ${body.length} global command(s).`);
  } catch (error) {
    console.error("Failed to sync commands with Discord API:", error.message);
    throw error;
  }
}

async function bootstrap() {
  try {
    const env = loadEnv();

    try {
      const extractedClientId = Buffer.from(env.token.split('.')[0], 'base64').toString('utf-8');
      if (extractedClientId && /^\d+$/.test(extractedClientId)) {
        env.clientId = extractedClientId;
      }
    } catch (e) {
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });
    client.appEnv = env;

    client.commands = new Collection();
    client.componentHandlers = [];
    client.modalHandlers = [];

    client.prefixCommands = new Collection();
    client.aliases = new Collection();

    const prefixCommandsPath = path.join(__dirname, "../prefixCommands");
    if (fs.existsSync(prefixCommandsPath)) {
      const prefixCommandFiles = getAllJsFiles(prefixCommandsPath);
      for (const file of prefixCommandFiles) {
        const pCmd = require(file);
        client.prefixCommands.set(pCmd.name, pCmd);
        if (pCmd.aliases && Array.isArray(pCmd.aliases)) {
          pCmd.aliases.forEach((alias) => client.aliases.set(alias, pCmd.name));
        }
      }
    }

    const commandsPath = path.join(__dirname, "../commands");
    const commands = [];
    if (fs.existsSync(commandsPath)) {
      const commandFiles = getAllJsFiles(commandsPath);
      for (const file of commandFiles) {
        const command = require(file);
        commands.push(command);
        client.commands.set(command.data.name, command);
        if (Array.isArray(command.componentHandlers)) {
          client.componentHandlers.push(...command.componentHandlers);
        }
        if (Array.isArray(command.modalHandlers)) {
          client.modalHandlers.push(...command.modalHandlers);
        }
      }
    }

    const eventsPath = path.join(__dirname, "../events");
    if (fs.existsSync(eventsPath)) {
      const eventFiles = getAllJsFiles(eventsPath);
      for (const file of eventFiles) {
        const event = require(file);
        if (event.once || event.name === 'ready') {
          client.once(event.name, (...args) => event.execute(...args));
        } else {
          client.on(event.name, (...args) => event.execute(...args));
        }
      }
    }

    await syncCommands(env, commands);

    await client.login(env.token);
  } catch (error) {
    console.error("Startup failed:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

module.exports = {
  bootstrap,
};