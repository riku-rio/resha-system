const { Events } = require("discord.js");
const autoreplyDb = require("../database/autoreplyDb");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) return;

    const lowerContent = message.content.toLowerCase();
    const guildId = message.guild?.id || null;

    const activeTriggers = autoreplyDb.getGuildReplies(guildId).filter((r) => r.enabled);

    let matchedTrigger = null;
    for (const record of activeTriggers) {
      const triggerLower = record.triggerMessage.toLowerCase();
      let isMatched = false;

      if (record.matchType === "exact") {
        isMatched = (lowerContent === triggerLower);
      } else if (record.matchType === "contains") {
        isMatched = lowerContent.includes(triggerLower);
      }

      if (!isMatched) continue;

      if (record.allowedChannels) {
        const allowedList = record.allowedChannels.split(",").map(id => id.trim()).filter(Boolean);
        if (allowedList.length > 0 && !allowedList.includes(message.channel.id)) {
          continue;
        }
      }

      if (record.deniedChannels) {
        const deniedList = record.deniedChannels.split(",").map(id => id.trim()).filter(Boolean);
        if (deniedList.length > 0 && deniedList.includes(message.channel.id)) {
          continue;
        }
      }


      if (record.allowedRoles) {
        const allowedRolesList = record.allowedRoles.split(",").map(id => id.trim()).filter(Boolean);
        if (allowedRolesList.length > 0) {
          const memberRoles = message.member?.roles.cache;
          if (!memberRoles || !allowedRolesList.some(roleId => memberRoles.has(roleId))) {
            continue;
          }
        }
      }

      matchedTrigger = record;
      break;
    }

    if (matchedTrigger) {
      let payload;
      if (matchedTrigger.replyType === "embed") {
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder()
          .setDescription(matchedTrigger.replyContent)
          .setColor(matchedTrigger.embedColor || "#5865F2");

        if (matchedTrigger.embedTitle) {
          embed.setTitle(matchedTrigger.embedTitle);
        }
        payload = { embeds: [embed] };
      } else {
        payload = { content: matchedTrigger.replyContent };
      }

      const shouldReply = matchedTrigger.replyToSender || matchedTrigger.replyType === "reply";

      if (shouldReply) {
        await message.reply(payload);
      } else {
        await message.channel.send(payload);
      }
      return;
    }

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

