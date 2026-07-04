const { Events, EmbedBuilder } = require("discord.js");
const logsDb = require("../database/logsDb");

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    const guildId = member.guild.id;
    const config = logsDb.getGuildConfig(guildId);
    if (!config.enabled) return;

    const channelId = config.channels?.memberLeave;
    if (!channelId) return;

    const logChannel = member.guild.channels.cache.get(channelId) || await member.guild.channels.fetch(channelId).catch(() => null);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("📤 Member Left")
      .setColor("#ED4245")
      .addFields(
        { name: "User", value: `${member.user.tag} (<@${member.user.id}>)`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch((err) => console.error("Failed to send guildMemberRemove log:", err.message));
  }
};
