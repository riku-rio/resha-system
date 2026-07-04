const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const reviewsDb = require("../database/reviewsDb");

function buildStars(stars) {
  const rating = Math.round(stars);
  return "⭐".repeat(rating) + "☆".repeat(5 - rating);
}

async function publishReview(guild, review) {
  const guildId = guild.id;
  const configWrapper = reviewsDb.getGuildConfig(guildId);
  const config = configWrapper.config || {};
  const channelId = config.reviewsChannel;

  if (!channelId) {
    console.warn(`[ReviewService] No reviews channel set for guild ${guildId}. Review not published.`);
    return;
  }

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn(`[ReviewService] Reviews channel ${channelId} not found in guild ${guildId}.`);
    return;
  }

  const rater = `<@${review.raterId}>`;
  const hasStaff = review.ratedId && review.ratedId !== "none" && review.ratedId !== "null";
  const ratedMember = hasStaff ? `<@${review.ratedId}>` : "`None`";

  const embed = new EmbedBuilder()
    .setTitle("✨ New Review Published")
    .setColor("#FEE75C")
    .addFields(
      { name: "👤 Customer", value: rater, inline: true },
      { name: "🛠️ Staff Member", value: ratedMember, inline: true },
      { name: "⭐ Rating", value: `${buildStars(review.stars)} (${review.stars}/5)`, inline: true },
      { name: "💬 Comment", value: review.comment || "*No comment provided.*" }
    )
    .setFooter({ text: `Ticket: #${review.ticketChannelName || "N/A"} | Source: ${review.source === "auto" ? "Automated" : "Manual"}` })
    .setTimestamp();

  if (hasStaff) {
    const stats = reviewsDb.getAverage(guildId, review.ratedId);
    embed.setDescription(`📈 **${ratedMember}'s Lifetime Stats:**\nAverage: **${stats.average} / 5** (${stats.count} reviews)`);
  }

  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`[ReviewService] Failed to send review message in channel ${channelId}:`, error);
  }
}

async function sendReviewRequest(client, guild, userId, ticketChannelName) {
  const ticket = guild.channels.cache.find(c => c.name === ticketChannelName || c.name.includes(ticketChannelName));
  let ratedStaffId = "none";

  if (ticket) {
    const ticketInfo = require("../database/ticketDb").getActiveTicket(guild.id, ticket.id);
    if (ticketInfo && ticketInfo.claimedBy) {
      ratedStaffId = ticketInfo.claimedBy;
    }
  }

  try {
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    const embed = new EmbedBuilder()
      .setTitle("⭐ Rate Our Service")
      .setDescription(
        `Thank you for contacting **${guild.name}**!\n` +
        `Your ticket \`#${ticketChannelName}\` has been closed.\n\n` +
        `We would highly appreciate it if you could take a moment to rate the service you received.`
      )
      .setColor("#5865F2")
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId(`review:start:${guild.id}:${ratedStaffId}`)
      .setLabel("Rate Service")
      .setEmoji("⭐")
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await user.send({ embeds: [embed], components: [row] }).catch(() => {
      console.log(`[ReviewService] Could not DM ticket owner ${userId} to request a review.`);
    });
  } catch (error) {
    console.error("[ReviewService] Error in sendReviewRequest:", error);
  }
}

module.exports = {
  buildStars,
  publishReview,
  sendReviewRequest
};
