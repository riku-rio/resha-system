const { EmbedBuilder } = require("discord.js");
const ticketDb = require("../database/ticketDb");

module.exports = {
  name: "topclaim",
  aliases: ["topclaims", "claimsleaderboard", "leaderboard"],
  async execute(message, args) {
    const guildId = message.guild.id;
    const claimStats = ticketDb.getClaimStats(guildId);

    // Convert object to array of [userId, count] and sort descending
    const sortedStats = Object.entries(claimStats)
      .map(([userId, count]) => ({ userId, count }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);

    const embed = new EmbedBuilder()
      .setTitle("🏆 Ticket Claims Leaderboard")
      .setColor("#5865F2")
      .setTimestamp();

    if (sortedStats.length === 0) {
      embed.setDescription("*No claimed tickets recorded yet on this server.*");
      return message.reply({ embeds: [embed] });
    }

    // Resolve users to display on the leaderboard
    let description = "";
    const topLimit = Math.min(sortedStats.length, 10);

    for (let i = 0; i < topLimit; i++) {
      const { userId, count } = sortedStats[i];
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i + 1}**`;
      description += `${medal} <@${userId}> — **${count}** ticket(s)\n`;
    }

    embed.setDescription(description);
    return message.reply({ embeds: [embed] });
  },
};
