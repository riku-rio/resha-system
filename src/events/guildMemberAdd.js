const { Events, EmbedBuilder } = require("discord.js");
const logsDb = require("../database/logsDb");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const guildId = member.guild.id;
    const config = logsDb.getGuildConfig(guildId);
    if (!config.enabled) return;

    const channelId = config.channels?.memberJoin;
    if (!channelId) return;

    const logChannel = member.guild.channels.cache.get(channelId) || await member.guild.channels.fetch(channelId).catch(() => null);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle("📥 Member Joined")
      .setColor("#57F287")
      .addFields(
        { name: "User", value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
        { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch((err) => console.error("Failed to send guildMemberAdd log:", err.message));
  }
};
