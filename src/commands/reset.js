const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const reviewsDb = require("../database/reviewsDb");
const ticketDb = require("../database/ticketDb");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Reset database entries for reviews or ticket claims.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName("reviews")
        .setDescription("Reset reviews database entries.")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("Target member to reset reviews for.")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("all")
            .setDescription("Reset reviews for all members.")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("claims")
        .setDescription("Reset claim statistics.")
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("Target member to reset claims for.")
            .setRequired(false)
        )
        .addBooleanOption((opt) =>
          opt
            .setName("all")
            .setDescription("Reset claims for all members.")
            .setRequired(false)
        )
    ),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "reviews") {
      const member = interaction.options.getUser("member");
      const all = interaction.options.getBoolean("all");

      if (!member && !all) {
        return interaction.reply({
          content: "❌ Please specify either a member to reset, or set `all` to True.",
          ephemeral: true,
        });
      }

      const guildConfig = reviewsDb.getGuildConfig(guildId);

      if (all) {
        guildConfig.reviews = [];
        reviewsDb.saveGuildConfig(guildId, guildConfig);
        return interaction.reply({
          content: "✅ All reviews for this server have been reset.",
          ephemeral: true,
        });
      }

      if (member) {
        guildConfig.reviews = (guildConfig.reviews || []).filter((r) => r.ratedId !== member.id);
        reviewsDb.saveGuildConfig(guildId, guildConfig);
        return interaction.reply({
          content: `✅ Reviews for ${member} have been reset.`,
          ephemeral: true,
        });
      }
    }

    if (subcommand === "claims") {
      const member = interaction.options.getUser("member");
      const all = interaction.options.getBoolean("all");

      if (!member && !all) {
        return interaction.reply({
          content: "❌ Please specify either a member to reset, or set `all` to True.",
          ephemeral: true,
        });
      }

      if (all) {
        ticketDb.resetClaimStats(guildId);
        return interaction.reply({
          content: "✅ All ticket claims for this server have been reset.",
          ephemeral: true,
        });
      }

      if (member) {
        ticketDb.resetClaimStats(guildId, member.id);
        return interaction.reply({
          content: `✅ Ticket claims for ${member} have been reset.`,
          ephemeral: true,
        });
      }
    }
  },
};
