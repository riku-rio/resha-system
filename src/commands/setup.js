const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const reviewsDb = require("../database/reviewsDb");
const logsDb = require("../database/logsDb");
const reviewService = require("../services/reviewService");

const sessions = new Map(); // key: userId -> object with temp editing state

function isAdmin(interaction) {
  return interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
}

const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure Reviews & Logging systems.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content: "❌ You need the **Administrator** permission to use this command.",
      ephemeral: true,
    });
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  sessions.set(userId, {
    currentSection: "main",
  });

  const payload = renderMainMenu(guildId);
  await interaction.reply({ ...payload, ephemeral: true });
}

function renderMainMenu(guildId) {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Server Setup Dashboard")
    .setDescription(
      "Welcome to the system configuration panel. Select one of the modules below to set it up."
    )
    .setColor("#5865F2")
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:section:reviews")
      .setLabel("⭐ Reviews System")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("setup:section:logs")
      .setLabel("📋 Logging System")
      .setStyle(ButtonStyle.Primary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [row]
  };
}

function renderReviewsMenu(guildId) {
  const guildConfig = reviewsDb.getGuildConfig(guildId);
  const config = guildConfig.config || {};
  const reviews = guildConfig.reviews || [];

  const reviewsChannelStr = config.reviewsChannel ? `<#${config.reviewsChannel}>` : "`None`";
  const reviewRoleStr = config.reviewRole ? `<@&${config.reviewRole}>` : "`None`";

  const embed = new EmbedBuilder()
    .setTitle("⭐ Reviews System Configuration")
    .setDescription(
      `Configure the settings for automated and manual reviews.\n\n` +
      `• **Reviews Channel:** ${reviewsChannelStr}\n` +
      `• **Rated Role:** ${reviewRoleStr}\n` +
      `• **Total Reviews:** \`${reviews.length}\``
    )
    .setColor("#FEE75C")
    .setTimestamp();

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId("setup:reviews:channel")
    .setPlaceholder("Select reviews channel (⭐-التقييمات)")
    .addChannelTypes(ChannelType.GuildText);

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId("setup:reviews:role")
    .setPlaceholder("Select the role allowed to be rated");

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:reviews:list")
      .setLabel("📋 List Reviews")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("setup:reviews:clearall")
      .setLabel("🗑️ Clear All")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("setup:back")
      .setLabel("⬅️ Back")
      .setStyle(ButtonStyle.Secondary)
  );

  const rowChannel = new ActionRowBuilder().addComponents(channelSelect);
  const rowRole = new ActionRowBuilder().addComponents(roleSelect);

  return {
    content: "",
    embeds: [embed],
    components: [rowChannel, rowRole, rowButtons]
  };
}

function renderReviewsList(guildId) {
  const guildConfig = reviewsDb.getGuildConfig(guildId);
  const reviews = guildConfig.reviews || [];

  const embed = new EmbedBuilder()
    .setTitle("📋 Server Reviews List")
    .setColor("#FEE75C")
    .setTimestamp();

  const lastReviews = reviews.slice(-5).reverse(); // last 5 reviews

  if (lastReviews.length === 0) {
    embed.setDescription("*No reviews found for this server.*");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("setup:section:reviews")
        .setLabel("⬅️ Back")
        .setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embed], components: [row] };
  }

  let desc = "";
  const row = new ActionRowBuilder();

  lastReviews.forEach((r) => {
    const staff = r.ratedId && r.ratedId !== "none" && r.ratedId !== "null" ? `<@${r.ratedId}>` : "`None`";
    desc += `**#${r.id}** - ⭐ ${r.stars}/5 by <@${r.raterId}> for ${staff}\n` +
            `💬 *${r.comment || "No comment"}*\n` +
            `📅 *${new Date(r.createdAt).toLocaleDateString()}*\n\n`;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`review:delete:${r.id}`)
        .setLabel(`Delete #${r.id}`)
        .setStyle(ButtonStyle.Danger)
    );
  });

  embed.setDescription(desc);

  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:section:reviews")
      .setLabel("⬅️ Back")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: row.components.length > 0 ? [row, rowBack] : [rowBack]
  };
}

function renderLogsMenu(guildId) {
  const config = logsDb.getGuildConfig(guildId);

  const statusStr = config.enabled ? "🟢 Enabled" : "🔴 Disabled";
  const autoCreateStr = config.autoCreate ? "🟢 Enabled" : "🔴 Disabled";

  const chanMsgDelete = config.channels?.messageDelete ? `<#${config.channels.messageDelete}>` : "`None`";
  const chanMsgEdit = config.channels?.messageEdit ? `<#${config.channels.messageEdit}>` : "`None`";
  const chanMemberJoin = config.channels?.memberJoin ? `<#${config.channels.memberJoin}>` : "`None`";
  const chanMemberLeave = config.channels?.memberLeave ? `<#${config.channels.memberLeave}>` : "`None`";

  const embed = new EmbedBuilder()
    .setTitle("📋 Logging System Configuration")
    .setDescription(
      `Configure log channels for server events.\n\n` +
      `• **Logging Status:** ${statusStr}\n` +
      `• **Auto-Create Channels:** ${autoCreateStr}\n\n` +
      `**Channels:**\n` +
      `• **Message Delete:** ${chanMsgDelete}\n` +
      `• **Message Edit:** ${chanMsgEdit}\n` +
      `• **Member Join:** ${chanMemberJoin}\n` +
      `• **Member Leave:** ${chanMemberLeave}`
    )
    .setColor("#5865F2")
    .setTimestamp();

  // Row 1: Buttons
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:logs:toggle_enabled")
      .setLabel(config.enabled ? "Disable Logging" : "Enable Logging")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("setup:logs:toggle_autocreate")
      .setLabel("Auto-Create: " + (config.autoCreate ? "ON" : "OFF"))
      .setStyle(config.autoCreate ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("setup:logs:autocreate_run")
      .setLabel("Run Auto-Create")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("setup:back")
      .setLabel("⬅️ Back")
      .setStyle(ButtonStyle.Secondary)
  );

  // We can put manual selects in rows 2, 3, 4, 5
  const selectMsgDelete = new ChannelSelectMenuBuilder()
    .setCustomId("setup:logs:select:messageDelete")
    .setPlaceholder("Select Message Delete channel")
    .addChannelTypes(ChannelType.GuildText);

  const selectMsgEdit = new ChannelSelectMenuBuilder()
    .setCustomId("setup:logs:select:messageEdit")
    .setPlaceholder("Select Message Edit channel")
    .addChannelTypes(ChannelType.GuildText);

  const selectMemberJoin = new ChannelSelectMenuBuilder()
    .setCustomId("setup:logs:select:memberJoin")
    .setPlaceholder("Select Member Join channel")
    .addChannelTypes(ChannelType.GuildText);

  const selectMemberLeave = new ChannelSelectMenuBuilder()
    .setCustomId("setup:logs:select:memberLeave")
    .setPlaceholder("Select Member Leave channel")
    .addChannelTypes(ChannelType.GuildText);

  const rowMsgDelete = new ActionRowBuilder().addComponents(selectMsgDelete);
  const rowMsgEdit = new ActionRowBuilder().addComponents(selectMsgEdit);
  const rowMemberJoin = new ActionRowBuilder().addComponents(selectMemberJoin);
  const rowMemberLeave = new ActionRowBuilder().addComponents(selectMemberLeave);

  return {
    content: "",
    embeds: [embed],
    components: [rowButtons, rowMsgDelete, rowMsgEdit, rowMemberJoin, rowMemberLeave]
  };
}

const componentHandlers = [
  {
    matches(customId) {
      return customId.startsWith("setup:") || customId.startsWith("review:") || customId.startsWith("rateview:") || customId.startsWith("rate:");
    },
    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const customId = interaction.customId;

      if (customId.startsWith("rate:select:")) {
        const stars = parseInt(customId.split(":")[2], 10);
        const pendingRates = interaction.client.pendingRates || new Map();
        const pendingData = pendingRates.get(interaction.message.id);

        if (!pendingData) {
          return interaction.reply({ content: "❌ This rating session has expired or is invalid.", ephemeral: true });
        }

        if (interaction.user.id !== pendingData.raterId) {
          return interaction.reply({ content: "❌ Only the person who initiated this rating can choose the stars.", ephemeral: true });
        }

        // Save review to Database
        const review = reviewsDb.createReview(guildId, {
          raterId: pendingData.raterId,
          ratedId: pendingData.ratedId,
          stars,
          comment: pendingData.comment,
          ticketChannelName: "Manual Rate",
          source: "manual"
        });

        // Publish Review
        const guild = interaction.client.guilds.cache.get(guildId) || await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          await reviewService.publishReview(guild, review);
        }

        // Remove from pending map
        pendingRates.delete(interaction.message.id);

        // Disable buttons and update embed
        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setDescription(`✅ **Rating Submitted!**\n\nThank you for rating <@${pendingData.ratedId}> **${stars}/5** stars!`)
          .setColor("#57F287");

        const disabledRows = interaction.message.components.map((row) => {
          const newRow = ActionRowBuilder.from(row);
          newRow.components.forEach((comp) => comp.setDisabled(true));
          return newRow;
        });

        return interaction.update({ embeds: [embed], components: disabledRows });
      }

      if (customId.startsWith("rateview:comments:")) {
        const memberId = customId.split(":")[2];
        const guildConfig = reviewsDb.getGuildConfig(guildId);
        const reviews = guildConfig.reviews || [];
        const memberReviews = reviews.filter((r) => r.ratedId === memberId);

        const embed = new EmbedBuilder()
          .setTitle("💬 Reviews Comments")
          .setColor("#5865F2")
          .setTimestamp();

        const lastReviews = memberReviews.slice(-5).reverse(); // last 5 comments

        if (lastReviews.length === 0) {
          return interaction.reply({ content: "❌ No comments found for this member.", ephemeral: true });
        }

        let desc = "";
        lastReviews.forEach((r) => {
          desc += `**⭐ ${r.stars}/5** by <@${r.raterId}>\n` +
                  `💬 *${r.comment || "No comment"}*\n` +
                  `📅 *${new Date(r.createdAt).toLocaleDateString()}*\n\n`;
        });

        embed.setDescription(desc);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const isConfigInteraction = customId.startsWith("setup:") || customId.startsWith("review:delete:") || customId.startsWith("review:clearall_");

      if (isConfigInteraction) {
        if (!isAdmin(interaction)) {
          return interaction.reply({ content: "❌ You need the **Administrator** permission to use this command.", ephemeral: true });
        }
      }

      if (customId === "setup:section:reviews") {
        sessions.set(userId, { currentSection: "reviews" });
        return interaction.update(renderReviewsMenu(guildId));
      }
      if (customId === "setup:section:logs") {
        sessions.set(userId, { currentSection: "logs" });
        return interaction.update(renderLogsMenu(guildId));
      }
      if (customId === "setup:back") {
        sessions.set(userId, { currentSection: "main" });
        return interaction.update(renderMainMenu(guildId));
      }

      if (customId === "setup:reviews:channel") {
        const chanId = interaction.values[0];
        const configWrapper = reviewsDb.getGuildConfig(guildId);
        configWrapper.config.reviewsChannel = chanId;
        reviewsDb.saveGuildConfig(guildId, configWrapper);
        return interaction.update(renderReviewsMenu(guildId));
      }

      if (customId === "setup:reviews:role") {
        const roleId = interaction.values[0];
        const configWrapper = reviewsDb.getGuildConfig(guildId);
        configWrapper.config.reviewRole = roleId;
        reviewsDb.saveGuildConfig(guildId, configWrapper);
        return interaction.update(renderReviewsMenu(guildId));
      }

      if (customId === "setup:reviews:list") {
        return interaction.update(renderReviewsList(guildId));
      }

      if (customId === "setup:reviews:clearall") {
        const embed = new EmbedBuilder()
          .setTitle("⚠️ Clear All Reviews")
          .setDescription("Are you sure you want to clear all reviews for this server? This action cannot be undone.")
          .setColor("#FF0000");
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("review:clearall_confirm").setLabel("Yes, Clear All").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("review:clearall_deny").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        );
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (customId === "review:clearall_confirm") {
        const configWrapper = reviewsDb.getGuildConfig(guildId);
        configWrapper.reviews = [];
        reviewsDb.saveGuildConfig(guildId, configWrapper);
        return interaction.update({ content: "✅ All reviews have been cleared.", embeds: [], components: [] });
      }

      if (customId === "review:clearall_deny") {
        return interaction.update(renderReviewsMenu(guildId));
      }

      if (customId.startsWith("review:delete:")) {
        const id = parseInt(customId.split(":")[2], 10);
        reviewsDb.deleteReview(guildId, id);
        return interaction.update(renderReviewsList(guildId));
      }

      if (customId.startsWith("setup:logs:toggle_enabled")) {
        const config = logsDb.getGuildConfig(guildId);
        config.enabled = !config.enabled;
        logsDb.saveGuildConfig(guildId, config);
        return interaction.update(renderLogsMenu(guildId));
      }

      if (customId.startsWith("setup:logs:toggle_autocreate")) {
        const config = logsDb.getGuildConfig(guildId);
        config.autoCreate = !config.autoCreate;
        logsDb.saveGuildConfig(guildId, config);
        return interaction.update(renderLogsMenu(guildId));
      }

      if (customId.startsWith("setup:logs:select:")) {
        const type = customId.split(":")[3];
        const chanId = interaction.values[0];
        logsDb.setLogChannel(guildId, type, chanId);
        return interaction.update(renderLogsMenu(guildId));
      }

      if (customId === "setup:logs:autocreate_run") {
        await interaction.deferUpdate();
        const guild = interaction.guild;
        try {
          let category = guild.channels.cache.find(c => c.name === "LOGS" && c.type === ChannelType.GuildCategory);
          if (!category) {
            category = await guild.channels.create({
              name: "LOGS",
              type: ChannelType.GuildCategory,
              permissionOverwrites: [
                {
                  id: guild.roles.everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel],
                }
              ]
            });
          }

          const logChannels = [
            { name: "message-delete", type: "messageDelete" },
            { name: "message-edit", type: "messageEdit" },
            { name: "member-join", type: "memberJoin" },
            { name: "member-leave", type: "memberLeave" }
          ];

          for (const item of logChannels) {
            let chan = guild.channels.cache.find(c => c.name === item.name && c.parentId === category.id);
            if (!chan) {
              chan = await guild.channels.create({
                name: item.name,
                type: ChannelType.GuildText,
                parent: category.id
              });
            }
            logsDb.setLogChannel(guildId, item.type, chan.id);
          }

          const config = logsDb.getGuildConfig(guildId);
          config.enabled = true;
          config.autoCreate = true;
          logsDb.saveGuildConfig(guildId, config);

          await interaction.editReply(renderLogsMenu(guildId));
        } catch (err) {
          console.error("Error during auto-create:", err);
          await interaction.followUp({ content: `❌ Error creating channels: ${err.message}`, ephemeral: true });
        }
        return;
      }

      // DM review button triggered
      // review:start:<guildId>:<ratedId>:<ticketChannelName>
      if (customId.startsWith("review:start:")) {
        const parts = customId.split(":");
        const gId = parts[2];
        const ratedId = parts[3];
        const ticketChannelName = parts[4] || "none";

        const embed = new EmbedBuilder()
          .setTitle("⭐ Rate Your Experience")
          .setDescription("Please select a rating from 1 to 5 stars below.")
          .setColor("#5865F2");

        const select = new StringSelectMenuBuilder()
          .setCustomId(`review:stars:${gId}:${ratedId}:${ticketChannelName}`)
          .setPlaceholder("Choose rating...")
          .addOptions([
            { label: "⭐ 5 Stars", value: "5", description: "Excellent service!" },
            { label: "⭐ 4 Stars", value: "4", description: "Good service." },
            { label: "⭐ 3 Stars", value: "3", description: "Average service." },
            { label: "⭐ 2 Stars", value: "2", description: "Poor service." },
            { label: "⭐ 1 Star", value: "1", description: "Very bad service." }
          ]);

        const row = new ActionRowBuilder().addComponents(select);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      // review:stars:<guildId>:<ratedId>:<ticketChannelName>
      if (customId.startsWith("review:stars:")) {
        const parts = customId.split(":");
        const gId = parts[2];
        const ratedId = parts[3];
        const ticketChannelName = parts[4] || "none";
        const stars = interaction.values[0];

        const modal = new ModalBuilder()
          .setCustomId(`review:modal:${gId}:${ratedId}:${stars}:${ticketChannelName}`)
          .setTitle("Leave a Comment");

        const textInput = new TextInputBuilder()
          .setCustomId("review_comment")
          .setLabel("Comment (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
          .setPlaceholder("Provide any details about your experience...");

        const row = new ActionRowBuilder().addComponents(textInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }
    }
  }
];

const modalHandlers = [
  {
    matches(customId) {
      return customId.startsWith("review:modal:");
    },
    async execute(interaction) {
      const parts = interaction.customId.split(":");
      const guildId = parts[2];
      const ratedId = parts[3];
      const stars = parts[4];
      const ticketChannelName = parts[5] || "none";

      const comment = interaction.fields.getTextInputValue("review_comment") || "";

      // Save to Database
      const review = reviewsDb.createReview(guildId, {
        raterId: interaction.user.id,
        ratedId,
        stars,
        comment,
        ticketChannelName,
        source: "auto"
      });

      // Publish Review
      const guild = interaction.client.guilds.cache.get(guildId) || await interaction.client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        await reviewService.publishReview(guild, review);
      }

      await interaction.reply({
        content: "💖 Thank you! Your review has been submitted successfully.",
        ephemeral: true
      });
    }
  }
];

module.exports = {
  data,
  execute,
  componentHandlers,
  modalHandlers
};
