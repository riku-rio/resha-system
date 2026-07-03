const { Events } = require("discord.js");
const prisma = require("../config/database");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    // ── Auto-reply lookup (runs before all other checks) ──────────────────────
    const lowerContent = message.content.toLowerCase();
    const autoReply = await prisma.autoReply.findUnique({
      where: { triggerMessage: lowerContent },
    });

    if (autoReply) {
      await message.channel.send(autoReply.replyContent);
      return;
    }

    // Check for "hello" (case-insensitive)
    if (lowerContent === "hello") {
      await message.reply("Hey");
      return;
    }

    const prefix = message.client.appEnv?.prefix || "!";

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command =
      message.client.prefixCommands.get(commandName) ||
      message.client.prefixCommands.get(message.client.aliases.get(commandName));

    if (!command) return;

    try {
      await command.execute(message, args);
    } catch (error) {
      console.error(error);
      await message.reply({ content: "There was an error trying to execute that command!" });
    }
  },
};

