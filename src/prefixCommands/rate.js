const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const reviewsDb = require("../database/reviewsDb");
const reviewService = require("../services/reviewService");

module.exports = {
  name: "rate",
  aliases: ["review"],
  async execute(message, args) {
    const guildId = message.guild.id;

    // Check for delete/remove command
    if (args[0] === "delete" || args[0] === "remove") {
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply("❌ Only administrators can delete reviews.");
      }
      const id = parseInt(args[1], 10);
      if (isNaN(id)) {
        return message.reply("❌ Please provide a valid review ID. Usage: `!rate delete <id>`");
      }
      const deleted = reviewsDb.deleteReview(guildId, id);
      if (!deleted) {
        return message.reply(`❌ Review with ID **#${id}** not found.`);
      }
      return message.reply(`✅ Review **#${id}** has been deleted.`);
    }

    const targetMember = message.mentions.members.first();
    if (!targetMember) {
      return message.reply("❌ Usage: `!rate @member [comment]` or `!rate delete <id>`");
    }

    // Role gate check: check if the staff member has the required role
    const configWrapper = reviewsDb.getGuildConfig(guildId);
    const config = configWrapper.config || {};
    if (config.reviewRole && !targetMember.roles.cache.has(config.reviewRole)) {
      return message.reply(`❌ That member does not have the required role (<@&${config.reviewRole}>) to be rated.`);
    }

    // Parse comment by removing the mention from the arguments list
    // The mention is usually the first argument (args[0]), so the rest is the comment
    const comment = args.slice(1).join(" ").trim();

    // Create buttons for rating
    const embed = new EmbedBuilder()
      .setTitle("⭐ Rate Staff Member")
      .setDescription(`Please rate the service provided by ${targetMember} by clicking one of the buttons below.`)
      .setColor("#5865F2");

    if (comment) {
      embed.addFields({ name: "💬 Your Comment", value: comment });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("rate:select:1").setLabel("1 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("rate:select:2").setLabel("2 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("rate:select:3").setLabel("3 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("rate:select:4").setLabel("4 ⭐").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("rate:select:5").setLabel("5 ⭐").setStyle(ButtonStyle.Secondary)
    );

    const replyMsg = await message.reply({ embeds: [embed], components: [row] });

    // Store in global pendingRates Map
    message.client.pendingRates = message.client.pendingRates || new Map();
    message.client.pendingRates.set(replyMsg.id, {
      raterId: message.author.id,
      ratedId: targetMember.id,
      comment: comment
    });
  },
};
