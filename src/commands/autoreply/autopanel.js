const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require("discord.js");
const autoreplyDb = require("../../database/autoreplyDb");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAdmin(interaction) {
  return interaction.member?.permissions.has("Administrator");
}

// ─── Slash Command Definition ─────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("autopanel")
  .setDescription("Manage auto-reply triggers for this server.")
  .addStringOption((option) =>
    option
      .setName("action")
      .setDescription("What do you want to do?")
      .setRequired(true)
      .addChoices(
        { name: "Add", value: "Add" },
        { name: "Edit", value: "Edit" },
        { name: "Delete", value: "Delete" },
        { name: "List", value: "List" }
      )
  )
  .addStringOption((option) =>
    option
      .setName("query")
      .setDescription("Search for an existing trigger (required for Edit / Delete).")
      .setRequired(false)
      .setAutocomplete(true)
  );

// ─── Autocomplete ─────────────────────────────────────────────────────────────

async function autocomplete(interaction) {
  const action = interaction.options.getString("action");

  if (action === "Add" || action === "List") {
    await interaction.respond([]);
    return;
  }

  // Edit or Delete — search existing triggers
  const focused = interaction.options.getFocused().toLowerCase();
  const replies = await autoreplyDb.getGuildReplies(interaction.guildId);

  const filtered = replies
    .filter((r) => r.triggerMessage.toLowerCase().includes(focused))
    .slice(0, 25);

  const choices = filtered.map((r) => {
    const statusIcon = r.enabled ? "✅" : "⛔";
    const typeIcon = r.replyType === "embed" ? "🖼️" : r.replyToSender ? "↩️" : "💬";
    return {
      name: `${statusIcon} ${typeIcon} ${r.triggerMessage}`,
      value: String(r.id),
    };
  });

  await interaction.respond(choices);
}


async function buildControlPanelMessage(guildId, recordId) {
  const record = await autoreplyDb.getAutoReply(guildId, recordId);
  if (!record) {
    return { content: "❌ Auto-reply configuration not found.", embeds: [], components: [] };
  }

  const summaryEmbed = new EmbedBuilder()
    .setTitle("⚙️ Auto-Reply Settings Control Panel")
    .setDescription(`Manage all settings for trigger: **\`${record.triggerMessage}\`**`)
    .setColor("#5865F2")
    .addFields(
      { name: "Trigger Message", value: `\`${record.triggerMessage}\``, inline: true },
      { name: "Status", value: record.enabled ? "🟢 Enabled" : "🔴 Disabled", inline: true },
      { name: "Match Type", value: record.matchType === "exact" ? "🎯 Exact Match" : "🔍 Contains Text", inline: true },
      { name: "Reply Type", value: record.replyType === "embed" ? "🖼️ Embed Message" : "💬 Plain Message", inline: true },
      { name: "Reply Mode", value: record.replyToSender ? "↩️ Reply to sender (pings/quotes)" : "💬 Standalone message (no ping)", inline: true },
      { name: "Allowed Channels", value: record.allowedChannels ? record.allowedChannels.split(",").map(id => `<#${id}>`).join(", ") : "All Channels", inline: false },
      { name: "Denied Channels", value: record.deniedChannels ? record.deniedChannels.split(",").map(id => `<#${id}>`).join(", ") : "None", inline: false },
      { name: "Allowed Roles", value: record.allowedRoles ? record.allowedRoles.split(",").map(id => `<@&${id}>`).join(", ") : "Everyone", inline: false }
    )
    .setTimestamp();

  if (record.replyType === "embed") {
    summaryEmbed.addFields(
      { name: "Embed Title", value: record.embedTitle || "*No Title*", inline: true },
      { name: "Embed Color", value: record.embedColor || "*Default*", inline: true }
    );
  }

  const contentPreview = record.replyContent.length > 1024
    ? record.replyContent.substring(0, 1021) + "..."
    : record.replyContent;
  summaryEmbed.addFields({ name: "Reply Content", value: contentPreview, inline: false });

  // Buttons Row
  const editContentBtn = new ButtonBuilder()
    .setCustomId(`autoreply:panel:edit_content:${record.id}`)
    .setLabel("📝 Edit Content")
    .setStyle(ButtonStyle.Primary);

  const toggleEnabledBtn = new ButtonBuilder()
    .setCustomId(`autoreply:panel:toggle_enabled:${record.id}`)
    .setLabel(record.enabled ? "🔴 Disable" : "🟢 Enable")
    .setStyle(record.enabled ? ButtonStyle.Danger : ButtonStyle.Success);

  const toggleMatchTypeBtn = new ButtonBuilder()
    .setCustomId(`autoreply:panel:toggle_matchtype:${record.id}`)
    .setLabel(record.matchType === "exact" ? "🔍 Set: Contains" : "🎯 Set: Exact")
    .setStyle(ButtonStyle.Secondary);

  const toggleReplyTypeBtn = new ButtonBuilder()
    .setCustomId(`autoreply:panel:toggle_replytype:${record.id}`)
    .setLabel(record.replyType === "embed" ? "💬 Set: Plain Message" : "🖼️ Set: Embed")
    .setStyle(ButtonStyle.Secondary);

  const toggleReplyModeBtn = new ButtonBuilder()
    .setCustomId(`autoreply:panel:toggle_reply_mode:${record.id}`)
    .setLabel(record.replyToSender ? "↩️ Reply Mode: ON" : "💬 Reply Mode: OFF")
    .setStyle(record.replyToSender ? ButtonStyle.Success : ButtonStyle.Secondary);

  const rowButtons = new ActionRowBuilder().addComponents(
    editContentBtn,
    toggleEnabledBtn,
    toggleMatchTypeBtn,
    toggleReplyTypeBtn,
    toggleReplyModeBtn
  );

  const allowedChanSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`autoreply:select:allowedChannels:${record.id}`)
    .setPlaceholder("Configure Allowed Channels (Empty = All)")
    .setMinValues(0)
    .setMaxValues(10);

  const deniedChanSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`autoreply:select:deniedChannels:${record.id}`)
    .setPlaceholder("Configure Denied Channels")
    .setMinValues(0)
    .setMaxValues(10);

  const allowedRolesSelect = new RoleSelectMenuBuilder()
    .setCustomId(`autoreply:select:allowedRoles:${record.id}`)
    .setPlaceholder("Configure Allowed Roles (Empty = Everyone)")
    .setMinValues(0)
    .setMaxValues(10);

  const rowAllowedChan = new ActionRowBuilder().addComponents(allowedChanSelect);
  const rowDeniedChan = new ActionRowBuilder().addComponents(deniedChanSelect);
  const rowAllowedRoles = new ActionRowBuilder().addComponents(allowedRolesSelect);

  return {
    content: null,
    embeds: [summaryEmbed],
    components: [rowButtons, rowAllowedChan, rowDeniedChan, rowAllowedRoles]
  };
}

// ─── Execute ──────────────────────────────────────────────────────────────────

async function execute(interaction) {
  // 1. Permission check
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content: "❌ You need the **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const action = interaction.options.getString("action");
  const query = interaction.options.getString("query");

  // ── LIST ───────────────────────────────────────────────────────────────────
  if (action === "List") {
    const replies = await autoreplyDb.getGuildReplies(interaction.guildId);
    if (replies.length === 0) {
      await interaction.reply({
        content: "ℹ️ There are no auto-reply triggers configured in this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const listEmbed = new EmbedBuilder()
      .setTitle("📋 Server Auto-Reply Triggers")
      .setColor("#5865F2")
      .setDescription(
        replies
          .map((r, i) => {
            const status = r.enabled ? "✅" : "❌";
            const match = r.matchType === "exact" ? "🎯" : "🔍";
            const format = r.replyType === "embed" ? "🖼️" : r.replyToSender ? "↩️" : "💬";
            return `**${i + 1}.** ${status} ${match} ${format} \`${r.triggerMessage}\` → ${r.replyContent.length > 50 ? r.replyContent.substring(0, 47) + "..." : r.replyContent
              }`;
          })
          .join("\n")
      )
      .setFooter({ text: "Legend: ✅/❌ Enabled status | 🎯/🔍 Exact/Contains match | 🖼️/↩️/💬 Format (Embed/Reply/Message)" })
      .setTimestamp();

    await interaction.reply({
      embeds: [listEmbed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── ADD ────────────────────────────────────────────────────────────────────
  if (action === "Add") {
    const modal = new ModalBuilder()
      .setCustomId("autoreply:add_modal")
      .setTitle("Add Auto-Reply");

    const triggerInput = new TextInputBuilder()
      .setCustomId("trigger_message")
      .setLabel("Trigger Message")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("e.g. hello there")
      .setRequired(true)
      .setMaxLength(200);

    const replyInput = new TextInputBuilder()
      .setCustomId("reply_content")
      .setLabel("Reply Content")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("e.g. General Kenobi!")
      .setRequired(true)
      .setMaxLength(2000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(triggerInput),
      new ActionRowBuilder().addComponents(replyInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // ── EDIT / DELETE — require query ──────────────────────────────────────────
  if (!query) {
    await interaction.reply({
      content: `❌ Please select an existing trigger from the **query** autocomplete option before choosing **${action}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const recordId = parseInt(query, 10);
  if (isNaN(recordId)) {
    await interaction.reply({
      content: "❌ Invalid selection. Please choose an entry from the autocomplete list.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const record = await autoreplyDb.getAutoReply(interaction.guildId, recordId);
  if (!record) {
    await interaction.reply({
      content: "❌ That auto-reply no longer exists.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── EDIT ───────────────────────────────────────────────────────────────────
  if (action === "Edit") {
    const panel = await buildControlPanelMessage(interaction.guildId, record.id);
    await interaction.reply({
      ...panel,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (action === "Delete") {
    const confirmBtn = new ButtonBuilder()
      .setCustomId(`autoreply:delete_confirm:${record.id}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Danger);

    const denyBtn = new ButtonBuilder()
      .setCustomId(`autoreply:delete_deny:${record.id}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(confirmBtn, denyBtn);

    await interaction.reply({
      content: `⚠️ Are you sure you want to delete the trigger **\`${record.triggerMessage}\`**?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

// ─── Component Handlers (Buttons / Selects) ───────────────────────────────────

const componentHandlers = [
  // Delete — Confirm button
  {
    matches(customId) {
      return customId.startsWith("autoreply:delete_confirm:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to do that.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const id = parseInt(interaction.customId.split(":")[2], 10);
      const deleted = await autoreplyDb.deleteAutoReply(interaction.guildId, id);

      if (deleted) {
        await interaction.update({
          content: `✅ Auto-reply for trigger **\`${deleted.triggerMessage}\`** has been deleted.`,
          components: [],
        });
      } else {
        await interaction.update({
          content: "❌ Could not delete the record — it may have already been removed.",
          components: [],
        });
      }
    },
  },

  // Delete — Deny button
  {
    matches(customId) {
      return customId.startsWith("autoreply:delete_deny:");
    },
    async execute(interaction) {
      await interaction.update({
        content: "🚫 Deletion cancelled.",
        components: [],
      });
    },
  },

  // Toggle Enabled
  {
    matches(customId) {
      return customId.startsWith("autoreply:panel:toggle_enabled:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = parseInt(interaction.customId.split(":")[3], 10);
      const record = await autoreplyDb.getAutoReply(interaction.guildId, id);
      if (record) {
        await autoreplyDb.updateAutoReply(interaction.guildId, id, { enabled: !record.enabled });
        const panel = await buildControlPanelMessage(interaction.guildId, id);
        await interaction.update(panel);
      }
    }
  },

  // Toggle Match Type
  {
    matches(customId) {
      return customId.startsWith("autoreply:panel:toggle_matchtype:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = parseInt(interaction.customId.split(":")[3], 10);
      const record = await autoreplyDb.getAutoReply(interaction.guildId, id);
      if (record) {
        const nextMatch = record.matchType === "exact" ? "contains" : "exact";
        await autoreplyDb.updateAutoReply(interaction.guildId, id, { matchType: nextMatch });
        const panel = await buildControlPanelMessage(interaction.guildId, id);
        await interaction.update(panel);
      }
    }
  },

  // Toggle Reply Type
  {
    matches(customId) {
      return customId.startsWith("autoreply:panel:toggle_replytype:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = parseInt(interaction.customId.split(":")[3], 10);
      const record = await autoreplyDb.getAutoReply(interaction.guildId, id);
      if (record) {
        const nextType = record.replyType === "embed" ? "message" : "embed";
        await autoreplyDb.updateAutoReply(interaction.guildId, id, { replyType: nextType });
        const panel = await buildControlPanelMessage(interaction.guildId, id);
        await interaction.update(panel);
      }
    }
  },

  // Toggle Reply Mode
  {
    matches(customId) {
      return customId.startsWith("autoreply:panel:toggle_reply_mode:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = parseInt(interaction.customId.split(":")[4], 10);
      const record = await autoreplyDb.getAutoReply(interaction.guildId, id);
      if (record) {
        await autoreplyDb.updateAutoReply(interaction.guildId, id, { replyToSender: !record.replyToSender });
        const panel = await buildControlPanelMessage(interaction.guildId, id);
        await interaction.update(panel);
      }
    }
  },

  // Trigger Content Modal Button
  {
    matches(customId) {
      return customId.startsWith("autoreply:panel:edit_content:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = parseInt(interaction.customId.split(":")[3], 10);
      const record = await autoreplyDb.getAutoReply(interaction.guildId, id);
      if (!record) return;

      const modal = new ModalBuilder()
        .setCustomId(`autoreply:content_modal:${record.id}`)
        .setTitle("Edit Auto-Reply Content");

      const triggerInput = new TextInputBuilder()
        .setCustomId("trigger_message")
        .setLabel("Trigger Message")
        .setStyle(TextInputStyle.Short)
        .setValue(record.triggerMessage)
        .setRequired(true)
        .setMaxLength(200);

      const replyInput = new TextInputBuilder()
        .setCustomId("reply_content")
        .setLabel("Reply Content")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(record.replyContent)
        .setRequired(true)
        .setMaxLength(2000);

      const embedTitleInput = new TextInputBuilder()
        .setCustomId("embed_title")
        .setLabel("Embed Title (Optional)")
        .setStyle(TextInputStyle.Short)
        .setValue(record.embedTitle || "")
        .setRequired(false)
        .setMaxLength(250);

      const embedColorInput = new TextInputBuilder()
        .setCustomId("embed_color")
        .setLabel("Embed Color Hex (Optional)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("#5865F2")
        .setValue(record.embedColor || "")
        .setRequired(false)
        .setMaxLength(7);

      modal.addComponents(
        new ActionRowBuilder().addComponents(triggerInput),
        new ActionRowBuilder().addComponents(replyInput),
        new ActionRowBuilder().addComponents(embedTitleInput),
        new ActionRowBuilder().addComponents(embedColorInput)
      );

      await interaction.showModal(modal);
    }
  },

  // Allowed / Denied Channels & Roles selects
  {
    matches(customId) {
      return customId.startsWith("autoreply:select:");
    },
    async execute(interaction) {
      if (!isAdmin(interaction)) {
        await interaction.reply({ content: "❌ Permission Denied.", flags: MessageFlags.Ephemeral });
        return;
      }
      const parts = interaction.customId.split(":");
      const field = parts[2];
      const id = parseInt(parts[3], 10);

      // values holds selected IDs (comma-separated string list)
      const valuesStr = interaction.values.join(",");
      await autoreplyDb.updateAutoReply(interaction.guildId, id, { [field]: valuesStr });

      const panel = await buildControlPanelMessage(interaction.guildId, id);
      await interaction.update(panel);
    }
  }
];

// ─── Modal Handlers ───────────────────────────────────────────────────────────

const modalHandlers = [
  // Add modal
  {
    matches(customId) {
      return customId === "autoreply:add_modal";
    },
    async execute(interaction) {
      const triggerMessage = interaction.fields
        .getTextInputValue("trigger_message")
        .trim()
        .toLowerCase();

      const replyContent = interaction.fields
        .getTextInputValue("reply_content")
        .trim();

      // Check duplicate within guild
      const replies = await autoreplyDb.getGuildReplies(interaction.guildId);
      const existing = replies.find((r) => r.triggerMessage === triggerMessage);

      if (existing) {
        await interaction.reply({
          content: `❌ A trigger for **\`${triggerMessage}\`** already exists. Use **Edit** to update it.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const record = await autoreplyDb.createAutoReply(interaction.guildId, { triggerMessage, replyContent });
      const panel = await buildControlPanelMessage(interaction.guildId, record.id);

      await interaction.reply({
        content: `✅ Auto-reply created! Configure detailed options below:`,
        ...panel,
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // Edit Content modal
  {
    matches(customId) {
      return customId.startsWith("autoreply:content_modal:");
    },
    async execute(interaction) {
      const id = parseInt(interaction.customId.split(":")[2], 10);

      const triggerMessage = interaction.fields
        .getTextInputValue("trigger_message")
        .trim()
        .toLowerCase();

      const replyContent = interaction.fields
        .getTextInputValue("reply_content")
        .trim();

      const embedTitle = interaction.fields
        .getTextInputValue("embed_title")
        .trim() || null;

      const embedColor = interaction.fields
        .getTextInputValue("embed_color")
        .trim() || null;

      // Validate hex color if provided
      if (embedColor && !/^#[0-9A-F]{6}$/i.test(embedColor)) {
        await interaction.reply({
          content: "❌ Invalid Hex color code format! It must start with `#` followed by 6 hex characters (e.g. `#FF0000`).",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const replies = await autoreplyDb.getGuildReplies(interaction.guildId);
      const collision = replies.find((r) => r.triggerMessage === triggerMessage && r.id !== id);

      if (collision) {
        await interaction.reply({
          content: `❌ Another auto-reply in this server already uses the trigger **\`${triggerMessage}\`**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await autoreplyDb.updateAutoReply(interaction.guildId, id, {
        triggerMessage,
        replyContent,
        embedTitle,
        embedColor
      });

      const panel = await buildControlPanelMessage(interaction.guildId, id);
      await interaction.update(panel);
    },
  },
];

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  data,
  autocomplete,
  execute,
  componentHandlers,
  modalHandlers,
};
