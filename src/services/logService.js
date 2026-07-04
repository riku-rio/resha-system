const { EmbedBuilder } = require("discord.js");
const logsDb = require("../database/logsDb");

async function getLogChannel(guild, type) {
  const config = logsDb.getGuildConfig(guild.id);
  if (!config.enabled) return null;
  const channelId = config.channels?.[type];
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

module.exports = {
  async logMessageDelete(message) {
    if (!message.guild || message.author?.bot) return;
    const channel = await getLogChannel(message.guild, "messageDelete");
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Message Deleted")
      .setColor("#ED4245")
      .addFields(
        { name: "👤 Author", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
        { name: "📺 Channel", value: `<#${message.channel.id}>`, inline: true },
        { name: "📝 Content", value: message.content || "*No text content (embed or attachment)*" }
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => null);
  },

  async logMessageUpdate(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
    const channel = await getLogChannel(newMessage.guild, "messageEdit");
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("✏️ Message Edited")
      .setColor("#E67E22")
      .addFields(
        { name: "👤 Author", value: `${newMessage.author.tag} (<@${newMessage.author.id}>)`, inline: true },
        { name: "📺 Channel", value: `<#${newMessage.channel.id}>`, inline: true },
        { name: "◀️ Before", value: oldMessage.content || "*Uncached/Empty*", inline: false },
        { name: "▶️ After", value: newMessage.content || "*Uncached/Empty*", inline: false }
      )
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => null);
  },

  async logMemberJoin(member) {
    const channel = await getLogChannel(member.guild, "memberJoin");
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("📥 Member Joined")
      .setColor("#57F287")
      .addFields(
        { name: "👤 User", value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
        { name: "📅 Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => null);
  },

  async logMemberRemove(member) {
    const channel = await getLogChannel(member.guild, "memberLeave");
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("📤 Member Left")
      .setColor("#ED4245")
      .addFields(
        { name: "👤 User", value: `${member.user.tag} (<@${member.user.id}>)`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => null);
  },

  async logTicketOpen(guild, channel, user, categoryName) {
    const logChan = await getLogChannel(guild, "ticket");
    if (!logChan) return;

    const embed = new EmbedBuilder()
      .setTitle("🎫 Ticket Created")
      .setColor("#57F287")
      .addFields(
        { name: "🆔 Ticket Channel", value: `${channel} (\`#${channel.name}\`)`, inline: true },
        { name: "👤 Creator", value: `${user.tag} (<@${user.id}>)`, inline: true },
        { name: "🏷️ Category/Type", value: `\`${categoryName || "Default"}\``, inline: true }
      )
      .setTimestamp();
    await logChan.send({ embeds: [embed] }).catch(() => null);
  },

  async logTicketClaim(guild, channel, staff) {
    const logChan = await getLogChannel(guild, "ticket");
    if (!logChan) return;

    const embed = new EmbedBuilder()
      .setTitle("🤝 Ticket Claimed")
      .setColor("#3498DB")
      .addFields(
        { name: "🆔 Ticket Channel", value: `${channel} (\`#${channel.name}\`)`, inline: true },
        { name: "👤 Claimed By", value: `${staff.tag} (<@${staff.id}>)`, inline: true }
      )
      .setTimestamp();
    await logChan.send({ embeds: [embed] }).catch(() => null);
  },

  async logTicketClose(guild, channel, closer, ticketInfo, reason, transcriptAttachment) {
    const logChan = await getLogChannel(guild, "ticket");
    if (!logChan) return;

    const embed = new EmbedBuilder()
      .setTitle("🔒 Ticket Closed")
      .setColor("#E74C3C")
      .addFields(
        { name: "🆔 Ticket Channel", value: `\`#${channel.name}\``, inline: true },
        { name: "👤 Closed By", value: `${closer.tag} (<@${closer.id}>)`, inline: true },
        { name: "👤 Ticket Owner", value: `<@${ticketInfo.userId}> (\`${ticketInfo.userId}\`)`, inline: true },
        { name: "💬 Close Reason", value: `\`${reason || "No reason specified"}\`` }
      )
      .setTimestamp();

    const files = transcriptAttachment ? [transcriptAttachment] : [];
    await logChan.send({ embeds: [embed], files }).catch(() => null);
  },

  async logTicketDelete(guild, channelName, deletedBy) {
    const logChan = await getLogChannel(guild, "ticket");
    if (!logChan) return;

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Ticket Deleted")
      .setColor("#95A5A6")
      .addFields(
        { name: "🆔 Ticket Name", value: `\`#${channelName}\``, inline: true },
        { name: "👤 Deleted By", value: `${deletedBy.tag} (<@${deletedBy.id}>)`, inline: true }
      )
      .setTimestamp();
    await logChan.send({ embeds: [embed] }).catch(() => null);
  },

  async logTicketTranscript(guild, channel, exporter, ticketInfo, transcriptAttachment) {
    const logChan = await getLogChannel(guild, "ticket");
    if (!logChan) return;

    const embed = new EmbedBuilder()
      .setTitle("📜 Ticket Transcript Exported")
      .setColor("#9B59B6")
      .addFields(
        { name: "🆔 Ticket Channel", value: `\`#${channel.name}\``, inline: true },
        { name: "👤 Exported By", value: `${exporter.tag} (<@${exporter.id}>)`, inline: true },
        { name: "👤 Ticket Owner", value: `<@${ticketInfo.userId}> (\`${ticketInfo.userId}\`)`, inline: true }
      )
      .setTimestamp();

    const files = transcriptAttachment ? [transcriptAttachment] : [];
    await logChan.send({ embeds: [embed], files }).catch(() => null);
  }
};
