const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const reviewsDb = require("../database/reviewsDb");
const reviewService = require("../services/reviewService");

module.exports = {
  name: "rateview",
  aliases: ["reviews", "ratings"],
  async execute(message, args) {
    const guildId = message.guild.id;

    const targetMember = message.mentions.members.first();
    if (!targetMember) {
      return message.reply("❌ Usage: `!rateview @member`");
    }

    const guildReviews = reviewsDb.getGuildReviews(guildId);
    const memberReviews = guildReviews.filter((r) => r.ratedId === targetMember.id);
    const stats = reviewsDb.getAverage(guildId, targetMember.id);

    // Calculate stars breakdown
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    memberReviews.forEach((r) => {
      if (breakdown[r.stars] !== undefined) {
        breakdown[r.stars]++;
      }
    });

    const starIcons = reviewService.buildStars(stats.average);

    const embed = new EmbedBuilder()
      .setTitle(`⭐ Ratings for ${targetMember.user.username}`)
      .setThumbnail(targetMember.user.displayAvatarURL({ forceStatic: false }))
      .setColor("#FEE75C")
      .setDescription(
        `📈 **Overview:**\n` +
        `• **Average Rating:** ${starIcons} **${stats.average} / 5**\n` +
        `• **Total Reviews:** \`${stats.count}\` review(s)\n\n` +
        `📊 **Breakdown:**\n` +
        `• **5 Stars:** \`${breakdown[5]}\` (${stats.count > 0 ? Math.round((breakdown[5]/stats.count)*100) : 0}%)\n` +
        `• **4 Stars:** \`${breakdown[4]}\` (${stats.count > 0 ? Math.round((breakdown[4]/stats.count)*100) : 0}%)\n` +
        `• **3 Stars:** \`${breakdown[3]}\` (${stats.count > 0 ? Math.round((breakdown[3]/stats.count)*100) : 0}%)\n` +
        `• **2 Stars:** \`${breakdown[2]}\` (${stats.count > 0 ? Math.round((breakdown[2]/stats.count)*100) : 0}%)\n` +
        `• **1 Star:**  \`${breakdown[1]}\` (${stats.count > 0 ? Math.round((breakdown[1]/stats.count)*100) : 0}%)`
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`rateview:comments:${targetMember.id}`)
        .setLabel("💬 View Comments")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(stats.count === 0)
    );

    return message.reply({ embeds: [embed], components: [row] });
  },
};
