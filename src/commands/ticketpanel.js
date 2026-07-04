const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require("discord.js");
const db = require("../database/ticketDb");
const reviewService = require("../services/reviewService");

const cooldowns = new Map(); // key: userId-buttonId -> expiration timestamp
const sessions = new Map();  // key: userId -> object with temp editing state

function isAdmin(interaction) {
  return interaction.member?.permissions.has(PermissionFlagsBits.Administrator);
}

function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

const data = new SlashCommandBuilder()
  .setName("ticketpanel")
  .setDescription("Configure and send the ticket panel.")
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
    editingButtonId: null,
    editingOptionId: null,
    editingInBtnId: null
  });

  const payload = renderMainMenu(guildId);
  await interaction.reply({ ...payload, ephemeral: true });
}

function renderMainMenu(guildId) {
  const config = db.getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket Control Panel")
    .setDescription(
      "Welcome to the Ticket System configuration dashboard. Use the select menu below to configure each module, then publish the panel using **Send Panel**.\n\n" +
      `**Current Setup:**\n` +
      `• **Buttons:** ${config.buttons.length} configured\n` +
      `• **Embed Title:** \`${config.embedSettings.title}\`\n` +
      `• **Logs Channel:** ${config.general.logsChannel ? `<#${config.general.logsChannel}>` : "`None`"}\n` +
      `• **Max Tickets Per User:** \`${config.general.maxTicketsPerUser}\`\n` +
      `• **Global Limit:** \`${config.general.globalLimit || "None"}\``
    )
    .setColor("#5865F2")
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId("ticketpanel:main_select")
    .setPlaceholder("Choose a configuration section...")
    .addOptions([
      { label: "Manage Buttons", value: "buttons", description: "Create or modify ticket-opening buttons", emoji: "🎫" },
      { label: "Manage Select Menus", value: "select_menus", description: "Configure hidden option menus", emoji: "📋" },
      { label: "Embed Settings", value: "embed", description: "Design the public panel appearance", emoji: "🎨" },
      { label: "Ticket Message Settings", value: "ticket_messages", description: "Set welcome messages & in-ticket buttons", emoji: "💬" },
      { label: "General Settings", value: "general", description: "Configure logs, limits, auto-close, etc.", emoji: "⚙️" },
      { label: "Send Panel", value: "send", description: "Publish the finalized panel to a channel", emoji: "📤" },
    ]);

  const closeBtn = new ButtonBuilder()
    .setCustomId("ticketpanel:close_panel")
    .setLabel("Close Config Panel")
    .setStyle(ButtonStyle.Danger);

  const rowSelect = new ActionRowBuilder().addComponents(select);
  const rowBtn = new ActionRowBuilder().addComponents(closeBtn);

  return {
    content: "",
    embeds: [embed],
    components: [rowSelect, rowBtn],
  };
}

function renderManageButtonsMenu(guildId, userId) {
  const config = db.getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("🎫 Button Management")
    .setDescription(
      "Configure buttons that will appear on the public ticket panel. Clicking these buttons will open a ticket or show a select menu (if configured).\n\n" +
      "**Current Buttons:**\n" +
      (config.buttons.length === 0
        ? "*No buttons configured yet. Click 'Add Button' below to create one.*"
        : config.buttons
            .map(
              (b, idx) =>
                `**${idx + 1}.** ${b.emoji || ""} **${b.label}** (Style: \`${b.style}\` | Cat: ${b.categoryId ? `<#${b.categoryId}>` : "`None`"})\n` +
                `   ↳ Select Menu: \`${b.hiddenSelectMenu?.enabled ? "Yes" : "No"}\` | Confirm: \`${b.confirmBeforeOpen ? "Yes" : "No"}\``
            )
            .join("\n"))
    )
    .setColor("#57F287");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:btn_add_request").setLabel("➕ Add Button").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  const components = [row];

  if (config.buttons.length > 0) {
    const configSelect = new StringSelectMenuBuilder()
      .setCustomId("ticketpanel:btn_configure_select")
      .setPlaceholder("Select a button to configure...")
      .addOptions(
        config.buttons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
          description: `Manage settings & questions for ${b.label}`.substring(0, 50),
        }))
      );
    
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId("ticketpanel:btn_remove_select")
      .setPlaceholder("Select a button to remove...")
      .addOptions(
        config.buttons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
          description: `Delete the button ${b.label}`.substring(0, 50),
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(configSelect));
    components.push(new ActionRowBuilder().addComponents(removeSelect));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderButtonConfigMenu(guildId, userId, buttonId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);

  if (!button) {
    return renderManageButtonsMenu(guildId, userId);
  }

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Configure Button: ${button.label}`)
    .setDescription(
      `Customize settings, conditions, and prompts for this button.\n\n` +
      `**Properties:**\n` +
      `• **Label:** \`${button.label}\`\n` +
      `• **Emoji:** ${button.emoji || "`None`"}\n` +
      `• **Style:** \`${button.style}\`\n` +
      `• **Category ID:** ${button.categoryId ? `<#${button.categoryId}>` : "`None`"}\n` +
      `• **Channel Name Format:** \`${button.channelNameFormat || "ticket-{username}"}\`\n` +
      `• **Hidden Select Menu:** \`${button.hiddenSelectMenu?.enabled ? "Enabled" : "Disabled"}\` (${button.hiddenSelectMenu?.options?.length || 0} options)\n` +
      `• **Confirm Before Opening:** \`${button.confirmBeforeOpen ? "Yes" : "No"}\`\n` +
      `• **Support Role:** ${button.supportRole ? `<@&${button.supportRole}>` : "`None`"}\n\n` +
      `**Open Conditions:**\n` +
      `• **Required Role:** ${button.requiredRole ? `<@&${button.requiredRole}>` : "`None`"}\n` +
      `• **Cooldown:** \`${button.cooldownSeconds || "None"}\` seconds\n` +
      `• **Max Tickets for Button:** \`${button.maxTicketsForThisButton || "None"}\`\n` +
      `• **Questions:** \`${button.questions?.length || 0}\` configured (max 5)`
    )
    .setColor("#FEE75C");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:btn_edit_basic:${buttonId}`).setLabel("✏️ Edit Fields").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:btn_edit_cond:${buttonId}`).setLabel("🔒 Conditions").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:btn_edit_support:${buttonId}`).setLabel("👥 Support Role").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:btn_questions_menu:${buttonId}`).setLabel("❓ Questions").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:btn_toggle_select:${buttonId}`).setLabel("🔀 Select Menu Toggle").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticketpanel:btn_toggle_confirm:${buttonId}`).setLabel("✅ Confirmation Toggle").setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:btn_delete:${buttonId}`).setLabel("🗑️ Delete Button").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticketpanel:section:buttons").setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [row1, row2, row3],
  };
}

function renderQuestionsMenu(guildId, userId, buttonId, isOption = false, optionId = null) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);

  if (!button) return renderMainMenu(guildId);

  let questions = [];
  let name = "";

  if (isOption) {
    const option = button.hiddenSelectMenu?.options?.find((o) => o.id === optionId);
    if (!option) return renderMainMenu(guildId);
    questions = option.questions || [];
    name = `Option: ${option.label}`;
  } else {
    questions = button.questions || [];
    name = `Button: ${button.label}`;
  }

  const embed = new EmbedBuilder()
    .setTitle(`❓ Question Configuration — ${name}`)
    .setDescription(
      "Configure up to 5 pre-ticket questions. These are presented to the user via a modal when opening a ticket.\n\n" +
      "**Current Questions:**\n" +
      (questions.length === 0
        ? "*No questions configured yet. Click 'Add Question' below to create one.*"
        : questions
            .map(
              (q, idx) =>
                `**${idx + 1}.** **${q.question}**\n` +
                `   ↳ Type: \`${q.type}\` | Required: \`${q.required ? "Yes" : "No"}\``
            )
            .join("\n"))
    )
    .setColor("#3498DB");

  const addCustomId = isOption
    ? `ticketpanel:opt_q_add:${buttonId}:${optionId}`
    : `ticketpanel:q_add:${buttonId}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(addCustomId).setLabel("➕ Add Question").setStyle(ButtonStyle.Success).setDisabled(questions.length >= 5),
    new ButtonBuilder().setCustomId(isOption ? `ticketpanel:sel_opt_conf:${buttonId}:${optionId}` : `ticketpanel:btn_conf:${buttonId}`).setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  const components = [row];

  if (questions.length > 0) {
    const removeCustomId = isOption
      ? `ticketpanel:opt_q_remove_select:${buttonId}:${optionId}`
      : `ticketpanel:q_remove_select:${buttonId}`;

    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId(removeCustomId)
      .setPlaceholder("Select a question to remove...")
      .addOptions(
        questions.map((q, idx) => ({
          label: `${idx + 1}. ${q.question}`.substring(0, 25),
          value: String(idx),
          description: `Delete: ${q.question}`.substring(0, 50),
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(removeSelect));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderManageSelectMenusMenu(guildId, userId) {
  const config = db.getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("📋 Manage Select Menus")
    .setDescription(
      "Choose which button's hidden select menu options you want to configure. Select menus allow users to route their tickets into sub-categories based on their choice."
    )
    .setColor("#9B59B6");

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  const components = [backRow];

  if (config.buttons.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("ticketpanel:sel_btn_select")
      .setPlaceholder("Select button...")
      .addOptions(
        config.buttons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
          description: `Dropdown options for ${b.label}`.substring(0, 50),
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(select));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderSelectMenuConfigMenu(guildId, userId, buttonId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);

  if (!button) return renderManageSelectMenusMenu(guildId, userId);

  const optMenu = button.hiddenSelectMenu || { enabled: false, options: [] };

  const embed = new EmbedBuilder()
    .setTitle(`📋 Select Menu Options: ${button.label}`)
    .setDescription(
      `Manage options for the dropdown select menu displayed when clicking the **${button.label}** button.\n\n` +
      `• **Status:** \`${optMenu.enabled ? "Enabled" : "Disabled"}\`\n` +
      `• **Options Configured:** ${optMenu.options?.length || 0}/25\n\n` +
      `**Current Options:**\n` +
      (!optMenu.options || optMenu.options.length === 0
        ? "*No options configured yet.*"
        : optMenu.options
            .map(
              (o, idx) =>
                `**${idx + 1}.** ${o.emoji || ""} **${o.label}** (Category: ${o.categoryId ? `<#${o.categoryId}>` : "`None`"})\n` +
                `   ↳ \`${o.description || "No description"}\` | Questions: \`${o.questions?.length || 0}\``
            )
            .join("\n"))
    )
    .setColor("#9B59B6");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:sel_toggle_enable:${buttonId}`).setLabel(optMenu.enabled ? "🔀 Disable Dropdown" : "🔀 Enable Dropdown").setStyle(optMenu.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticketpanel:sel_add_opt_req:${buttonId}`).setLabel("➕ Add Option").setStyle(ButtonStyle.Primary).setDisabled(optMenu.options?.length >= 25),
    new ButtonBuilder().setCustomId(`ticketpanel:sel_preview:${buttonId}`).setLabel("👁️ Preview").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:section:select_menus").setLabel("↩️ Back to Select Menus").setStyle(ButtonStyle.Secondary)
  );

  const components = [row1, row2];

  if (optMenu.options && optMenu.options.length > 0) {
    const editSelect = new StringSelectMenuBuilder()
      .setCustomId(`ticketpanel:sel_edit_opt_select:${buttonId}`)
      .setPlaceholder("Choose an option to edit...")
      .addOptions(
        optMenu.options.map((o) => ({
          label: o.label.substring(0, 25),
          value: o.id,
          emoji: o.emoji || undefined,
          description: o.description ? o.description.substring(0, 50) : undefined,
        }))
      );

    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId(`ticketpanel:sel_remove_opt_select:${buttonId}`)
      .setPlaceholder("Choose an option to remove...")
      .addOptions(
        optMenu.options.map((o) => ({
          label: o.label.substring(0, 25),
          value: o.id,
          emoji: o.emoji || undefined,
          description: o.description ? o.description.substring(0, 50) : undefined,
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(editSelect));
    components.push(new ActionRowBuilder().addComponents(removeSelect));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderSelectOptionConfigMenu(guildId, userId, buttonId, optionId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);
  const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId);

  if (!option) return renderSelectMenuConfigMenu(guildId, userId, buttonId);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Option: ${option.label}`)
    .setDescription(
      `Configure properties and questions specifically for this option.\n\n` +
      `• **Label:** \`${option.label}\`\n` +
      `• **Description:** \`${option.description || "None"}\`\n` +
      `• **Emoji:** ${option.emoji || "`None`"}\n` +
      `• **Category ID:** ${option.categoryId ? `<#${option.categoryId}>` : "`None`"}\n` +
      `• **Questions:** \`${option.questions?.length || 0}\` configured (max 5)`
    )
    .setColor("#9B59B6");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:sel_opt_edit_fields:${buttonId}:${optionId}`).setLabel("✏️ Edit Fields").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:sel_opt_q_menu:${buttonId}:${optionId}`).setLabel("❓ Manage Questions").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:sel_menu_config:${buttonId}`).setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [row],
  };
}

function renderEmbedSettingsMenu(guildId) {
  const config = db.getGuildConfig(guildId);
  const emb = config.embedSettings;

  const embed = new EmbedBuilder()
    .setTitle("🎨 Embed Settings Dashboard")
    .setDescription(
      "Configure the appearance of the public ticket panel embed that is sent to the users.\n\n" +
      `• **Title:** \`${emb.title}\`\n` +
      `• **Description:** \`${emb.description}\`\n` +
      `• **Color:** \`${emb.color}\`\n` +
      `• **Image URL:** ${emb.image ? `\`${emb.image}\`` : "`None`"}\n` +
      `• **Footer:** ${emb.footer ? `\`${emb.footer}\`` : "`None`"}`
    )
    .setColor("#E67E22");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:embed_edit_req").setLabel("✏️ Edit Embed details").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticketpanel:embed_preview").setLabel("👁️ Live Preview").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [row],
  };
}

function renderTicketMessagesMenu(guildId, userId) {
  const config = db.getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("💬 Ticket Messages Settings")
    .setDescription(
      "Configure what happens inside the ticket once it is created. Select the ticket opening button below to set up welcome messages, support roles, claims, and in-ticket action buttons."
    )
    .setColor("#1ABC9C");

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  const components = [backRow];

  if (config.buttons.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("ticketpanel:msg_btn_select")
      .setPlaceholder("Select button...")
      .addOptions(
        config.buttons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
          description: `Configure welcome messages for ${b.label}`.substring(0, 50),
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(select));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderButtonTicketMessagesMenu(guildId, userId, buttonId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);

  if (!button) return renderTicketMessagesMenu(guildId, userId);

  const msgConfig = config.ticketMessages[buttonId] || {
    welcomeMessage: "Welcome to your ticket! A staff member will be with you shortly.",
    embed: {
      title: "Ticket Support",
      description: "Please explain your issue in detail.",
      color: "#5865F2",
      image: null,
      footer: null
    },
    supportRole: null,
    renameOnClaim: true,
    insideButtons: []
  };

  const insideBtnCount = msgConfig.insideButtons?.length || 0;

  const embed = new EmbedBuilder()
    .setTitle(`💬 Inside-Ticket settings: ${button.label}`)
    .setDescription(
      `Configure the message format and utility buttons inside tickets opened by **${button.label}**.\n\n` +
      `• **Welcome Message text:** \`${msgConfig.welcomeMessage}\`\n` +
      `• **In-Ticket Embed:** \`${msgConfig.embed?.title || "Default"}\`\n` +
      `• **Rename on Claim:** \`${msgConfig.renameOnClaim ? "Yes" : "No"}\` (\`claimed-{username}\`)\n` +
      `• **Linked Support Role:** ${msgConfig.supportRole ? `<@&${msgConfig.supportRole}>` : "`None (Uses Button default)`"}\n` +
      `• **Inside Buttons:** \`${insideBtnCount === 0 ? "Uses Default Buttons (Close, Claim, Member, Notify, Transcript)" : `${insideBtnCount} custom buttons`}\``
    )
    .setColor("#1ABC9C");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:msg_edit_welcome:${buttonId}`).setLabel("📝 Welcome Message").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:msg_edit_embed:${buttonId}`).setLabel("🎨 In-Ticket Embed").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:msg_edit_support_role:${buttonId}`).setLabel("👥 Support Role").setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:msg_buttons_menu:${buttonId}`).setLabel("🔘 Manage Buttons").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:msg_toggle_rename:${buttonId}`).setLabel("✏️ Toggle Rename").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticketpanel:section:ticket_messages").setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [row1, row2],
  };
}

function renderInTicketButtonsMenu(guildId, userId, buttonId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);
  if (!button) return renderTicketMessagesMenu(guildId, userId);

  const msgConfig = config.ticketMessages[buttonId] || {};
  const insideButtons = msgConfig.insideButtons || [];

  const embed = new EmbedBuilder()
    .setTitle(`🔘 In-Ticket Buttons: ${button.label}`)
    .setDescription(
      "Customize the button toolbar displayed inside tickets opened from this button. If empty, the system defaults to showing standard Close, Claim, Add Member, Notify, and Transcript buttons.\n\n" +
      "**Current Custom Buttons:**\n" +
      (insideButtons.length === 0
        ? "*No custom buttons. Defaulting to: Close, Claim, Add Member, Notify, Transcript.*"
        : insideButtons
            .map(
              (btn, idx) =>
                `**${idx + 1}.** ${btn.emoji || ""} **${btn.label}** (Style: \`${btn.style}\` | Mode: \`${btn.actionType}\` | Action: \`${btn.action}\`)\n` +
                (btn.actionType === "selectMenu" ? `   ↳ Option Dropdowns: \`${btn.selectOptions?.length || 0}\` options` : "")
            )
            .join("\n"))
    )
    .setColor("#2ECC71");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:msg_btn_add_req:${buttonId}`).setLabel("➕ Add Button").setStyle(ButtonStyle.Success).setDisabled(insideButtons.length >= 5),
    new ButtonBuilder().setCustomId(`ticketpanel:msg_menu:${buttonId}`).setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  const components = [row];

  if (insideButtons.length > 0) {
    const configSel = new StringSelectMenuBuilder()
      .setCustomId(`ticketpanel:msg_btn_configure_select:${buttonId}`)
      .setPlaceholder("Select a button to configure options...")
      .addOptions(
        insideButtons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
        }))
      );

    const deleteSel = new StringSelectMenuBuilder()
      .setCustomId(`ticketpanel:msg_btn_delete_select:${buttonId}`)
      .setPlaceholder("Select a button to delete...")
      .addOptions(
        insideButtons.map((b) => ({
          label: b.label.substring(0, 25),
          value: b.id,
          emoji: b.emoji || undefined,
        }))
      );

    components.unshift(new ActionRowBuilder().addComponents(configSel));
    components.push(new ActionRowBuilder().addComponents(deleteSel));
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderInTicketButtonConfigMenu(guildId, userId, buttonId, inBtnId) {
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);
  const msgConfig = config.ticketMessages[buttonId] || {};
  const insideBtn = msgConfig.insideButtons?.find((b) => b.id === inBtnId);

  if (!insideBtn) return renderInTicketButtonsMenu(guildId, userId, buttonId);

  const embed = new EmbedBuilder()
    .setTitle(`🔘 Button Config: ${insideBtn.label}`)
    .setDescription(
      `• **Label:** \`${insideBtn.label}\`\n` +
      `• **Emoji:** ${insideBtn.emoji || "`None`"}\n` +
      `• **Style:** \`${insideBtn.style}\`\n` +
      `• **Action Type:** \`${insideBtn.actionType}\` (\`direct\` or \`selectMenu\`)\n` +
      (insideBtn.actionType === "direct"
        ? `• **Direct Action:** \`${insideBtn.action}\` (close/claim/addMember/notify/transcript/custom)\n`
        : `• **Dropdown Options:** ${insideBtn.selectOptions?.length || 0}/25\n\n` +
          `**Options List:**\n` +
          (!insideBtn.selectOptions || insideBtn.selectOptions.length === 0
            ? "*No select dropdown options configured yet.*"
            : insideBtn.selectOptions
                .map(
                  (o, idx) =>
                    `**${idx + 1}.** ${o.emoji || ""} **${o.label}** (Action: \`${o.action}\`)\n` +
                    `   ↳ \`${o.description || "No description"}\``
                )
                .join("\n")))
    )
    .setColor("#2ECC71");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticketpanel:msg_btn_edit_fields:${buttonId}:${inBtnId}`).setLabel("✏️ Edit Fields").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticketpanel:msg_buttons_menu:${buttonId}`).setLabel("↩️ Back").setStyle(ButtonStyle.Secondary)
  );

  const components = [row1];

  if (insideBtn.actionType === "selectMenu") {
    const optRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticketpanel:msg_btn_opt_add:${buttonId}:${inBtnId}`).setLabel("➕ Add Dropdown Option").setStyle(ButtonStyle.Success).setDisabled(insideBtn.selectOptions?.length >= 25)
    );
    components.push(optRow);

    if (insideBtn.selectOptions && insideBtn.selectOptions.length > 0) {
      const deleteOptSel = new StringSelectMenuBuilder()
        .setCustomId(`ticketpanel:msg_btn_opt_remove_select:${buttonId}:${inBtnId}`)
        .setPlaceholder("Select a dropdown option to delete...")
        .addOptions(
          insideBtn.selectOptions.map((o, idx) => ({
            label: o.label.substring(0, 25),
            value: String(idx),
            emoji: o.emoji || undefined,
            description: o.description ? o.description.substring(0, 50) : undefined,
          }))
        );

      components.push(new ActionRowBuilder().addComponents(deleteOptSel));
    }
  }

  return {
    content: "",
    embeds: [embed],
    components,
  };
}

function renderGeneralSettingsMenu(guildId) {
  const config = db.getGuildConfig(guildId);
  const gen = config.general;

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Server-Wide General Settings")
    .setDescription(
      `Adjust system limits, log targets, and automatic actions.\n\n` +
      `• **Max Tickets Per User:** \`${gen.maxTicketsPerUser}\` open tickets\n` +
      `• **Global Server Limit:** \`${gen.globalLimit || "Unlimited"}\` tickets\n` +
      `• **Logs Channel:** ${gen.logsChannel ? `<#${gen.logsChannel}>` : "`None`"}\n` +
      `• **Transcript on Close:** \`${gen.transcriptEnabled ? "Enabled" : "Disabled"}\`\n` +
      `• **Auto Close (Inactivity):** ${gen.autoCloseHours ? `\`${gen.autoCloseHours} hours\`` : "`Disabled`"}\n` +
      `• **Ask Close Reason:** \`${gen.closeReasonPrompt ? "Enabled" : "Disabled"}\`\n` +
      `• **Confirmation on Close:** \`${gen.confirmOnClose ? "Enabled" : "Disabled"}\``
    )
    .setColor("#7F8C8D");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:gen_edit_limits").setLabel("✏️ Edit Limits").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:gen_toggle_trans").setLabel("📜 Toggle Transcripts").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticketpanel:gen_toggle_reason").setLabel("❓ Toggle Reason Ask").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticketpanel:gen_toggle_confirm").setLabel("✅ Toggle Close Confirm").setStyle(ButtonStyle.Secondary)
  );

  const logsSelect = new ChannelSelectMenuBuilder()
    .setCustomId("ticketpanel:gen_logs_select")
    .setPlaceholder("Select a Text Channel for Logging...")
    .setChannelTypes([ChannelType.GuildText]);

  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(logsSelect), row1, row2],
  };
}

function renderSendPanelMenu(guildId) {
  const config = db.getGuildConfig(guildId);

  const embed = new EmbedBuilder()
    .setTitle("📤 Send Ticket Panel")
    .setDescription(
      "Select a channel below to publish the final ticket opening panel. Once published, players can click the buttons to open tickets.\n\n" +
      `⚠️ **Current setup preview:**\n` +
      `• Title: \`${config.embedSettings.title}\`\n` +
      `• Buttons to display: \`${config.buttons.length}\``
    )
    .setColor("#E67E22");

  const selectChannel = new ChannelSelectMenuBuilder()
    .setCustomId("ticketpanel:send_channel_select")
    .setPlaceholder("Select channel to publish...")
    .setChannelTypes([ChannelType.GuildText]);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("↩️ Back to Main").setStyle(ButtonStyle.Secondary)
  );

  return {
    content: "",
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(selectChannel), row],
  };
}

const componentHandlers = [
  {
    matches(customId) {
      return customId.startsWith("ticketpanel:") || customId.startsWith("ticket:") || customId.startsWith("ticket_");
    },
    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const customId = interaction.customId;

      if (customId === "ticketpanel:close_panel") {
        sessions.delete(userId);
        await interaction.update({
          content: "❌ Control panel closed.",
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId.startsWith("ticketpanel:")) {
        if (!isAdmin(interaction)) {
          await interaction.reply({
            content: "❌ You don't have permission to modify configurations.",
            ephemeral: true,
          });
          return;
        }
      }

      if (customId === "ticketpanel:main_select") {
        const section = interaction.values[0];
        let payload;

        if (section === "buttons") {
          payload = renderManageButtonsMenu(guildId, userId);
        } else if (section === "select_menus") {
          payload = renderManageSelectMenusMenu(guildId, userId);
        } else if (section === "embed") {
          payload = renderEmbedSettingsMenu(guildId);
        } else if (section === "ticket_messages") {
          payload = renderTicketMessagesMenu(guildId, userId);
        } else if (section === "general") {
          payload = renderGeneralSettingsMenu(guildId);
        } else if (section === "send") {
          payload = renderSendPanelMenu(guildId);
        }

        await interaction.update(payload);
        return;
      }

      if (customId === "ticketpanel:back_to_main") {
        await interaction.update(renderMainMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:section:buttons") {
        await interaction.update(renderManageButtonsMenu(guildId, userId));
        return;
      }

      if (customId === "ticketpanel:section:select_menus") {
        await interaction.update(renderManageSelectMenusMenu(guildId, userId));
        return;
      }

      if (customId === "ticketpanel:section:ticket_messages") {
        await interaction.update(renderTicketMessagesMenu(guildId, userId));
        return;
      }

      if (customId === "ticketpanel:btn_add_request") {

        const modal = new ModalBuilder()
          .setCustomId("ticketpanel:modal_add_btn")
          .setTitle("Add Ticket Button");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Button Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("style").setLabel("Style (Primary, Secondary, Success, Danger)").setStyle(TextInputStyle.Short).setValue("Primary").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("category").setLabel("Target Category ID").setStyle(TextInputStyle.Short).setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("format").setLabel("Channel Name Format").setStyle(TextInputStyle.Short).setValue("ticket-{username}").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === "ticketpanel:btn_configure_select") {
        const buttonId = interaction.values[0];
        await interaction.update(renderButtonConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:btn_conf:")) {
        const buttonId = customId.split(":")[2];
        await interaction.update(renderButtonConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId === "ticketpanel:btn_remove_select") {
        const buttonId = interaction.values[0];
        const config = db.getGuildConfig(guildId);
        config.buttons = config.buttons.filter((b) => b.id !== buttonId);

        delete config.ticketMessages[buttonId];
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderManageButtonsMenu(guildId, userId));
        return;
      }

      if (customId.startsWith("ticketpanel:btn_delete:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        config.buttons = config.buttons.filter((b) => b.id !== buttonId);
        delete config.ticketMessages[buttonId];
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderManageButtonsMenu(guildId, userId));
        return;
      }

      if (customId.startsWith("ticketpanel:btn_edit_basic:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (!button) return;

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_edit_btn:${buttonId}`)
          .setTitle("Edit Button Details");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Button Label").setStyle(TextInputStyle.Short).setValue(button.label).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setValue(button.emoji || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("style").setLabel("Style (Primary, Secondary, Success, Danger)").setStyle(TextInputStyle.Short).setValue(button.style).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("category").setLabel("Target Category ID").setStyle(TextInputStyle.Short).setValue(button.categoryId || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("format").setLabel("Channel Name Format").setStyle(TextInputStyle.Short).setValue(button.channelNameFormat || "ticket-{username}").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:btn_edit_cond:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (!button) return;

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_edit_cond:${buttonId}`)
          .setTitle("Edit Button Conditions");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("requiredRole").setLabel("Required Role ID (Optional)").setStyle(TextInputStyle.Short).setValue(button.requiredRole || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("cooldown").setLabel("Cooldown in Seconds (Optional)").setStyle(TextInputStyle.Short).setValue(button.cooldownSeconds ? String(button.cooldownSeconds) : "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("maxTickets").setLabel("Max Tickets For This Button (Optional)").setStyle(TextInputStyle.Short).setValue(button.maxTicketsForThisButton ? String(button.maxTicketsForThisButton) : "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:btn_edit_support:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (!button) return;

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_edit_support:${buttonId}`)
          .setTitle("Button Support Role");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("supportRole").setLabel("Support Role ID (Optional)").setStyle(TextInputStyle.Short).setValue(button.supportRole || "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:btn_toggle_select:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.hiddenSelectMenu = button.hiddenSelectMenu || { enabled: false, options: [] };
          button.hiddenSelectMenu.enabled = !button.hiddenSelectMenu.enabled;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderButtonConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:btn_toggle_confirm:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.confirmBeforeOpen = !button.confirmBeforeOpen;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderButtonConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:btn_questions_menu:")) {
        const buttonId = customId.split(":")[2];
        await interaction.update(renderQuestionsMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:q_add:")) {
        const buttonId = customId.split(":")[2];
        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_add_q:${buttonId}`)
          .setTitle("Add Question");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("question").setLabel("Question Text").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("type").setLabel("Input Type (short or paragraph)").setStyle(TextInputStyle.Short).setValue("short").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("required").setLabel("Required? (yes or no)").setStyle(TextInputStyle.Short).setValue("yes").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:q_remove_select:")) {
        const buttonId = customId.split(":")[2];
        const idx = parseInt(interaction.values[0], 10);
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button && button.questions) {
          button.questions.splice(idx, 1);
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderQuestionsMenu(guildId, userId, buttonId));
        return;
      }

      if (customId === "ticketpanel:sel_btn_select") {
        const buttonId = interaction.values[0];
        await interaction.update(renderSelectMenuConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_menu_config:")) {
        const buttonId = customId.split(":")[2];
        await interaction.update(renderSelectMenuConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_toggle_enable:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.hiddenSelectMenu = button.hiddenSelectMenu || { enabled: false, options: [] };
          button.hiddenSelectMenu.enabled = !button.hiddenSelectMenu.enabled;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderSelectMenuConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_add_opt_req:")) {
        const buttonId = customId.split(":")[2];
        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_add_opt:${buttonId}`)
          .setTitle("Add Select Option");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Option Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(25)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("category").setLabel("Target Category ID").setStyle(TextInputStyle.Short).setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:sel_edit_opt_select:")) {
        const buttonId = customId.split(":")[2];
        const optionId = interaction.values[0];
        await interaction.update(renderSelectOptionConfigMenu(guildId, userId, buttonId, optionId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_opt_conf:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        await interaction.update(renderSelectOptionConfigMenu(guildId, userId, buttonId, optionId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_opt_edit_fields:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId);

        if (!option) return;

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_edit_opt:${buttonId}:${optionId}`)
          .setTitle("Edit Select Option");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Option Label").setStyle(TextInputStyle.Short).setValue(option.label).setRequired(true).setMaxLength(25)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Description").setStyle(TextInputStyle.Short).setValue(option.description || "").setRequired(false).setMaxLength(50)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setValue(option.emoji || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("category").setLabel("Target Category ID").setStyle(TextInputStyle.Short).setValue(option.categoryId || "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:sel_remove_opt_select:")) {
        const buttonId = customId.split(":")[2];
        const optionId = interaction.values[0];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button && button.hiddenSelectMenu) {
          button.hiddenSelectMenu.options = button.hiddenSelectMenu.options.filter((o) => o.id !== optionId);
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderSelectMenuConfigMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_opt_questions_select:")) {

        const buttonId = customId.split(":")[2];
        const optionId = interaction.values[0];
        await interaction.update(renderQuestionsMenu(guildId, userId, buttonId, true, optionId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_opt_q_menu:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        await interaction.update(renderQuestionsMenu(guildId, userId, buttonId, true, optionId));
        return;
      }

      if (customId.startsWith("ticketpanel:opt_q_add:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_opt_add_q:${buttonId}:${optionId}`)
          .setTitle("Add Option Question");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("question").setLabel("Question Text").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("type").setLabel("Input Type (short or paragraph)").setStyle(TextInputStyle.Short).setValue("short").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("required").setLabel("Required? (yes or no)").setStyle(TextInputStyle.Short).setValue("yes").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:opt_q_remove_select:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        const idx = parseInt(interaction.values[0], 10);
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId);

        if (option && option.questions) {
          option.questions.splice(idx, 1);
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderQuestionsMenu(guildId, userId, buttonId, true, optionId));
        return;
      }

      if (customId.startsWith("ticketpanel:sel_preview:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (!button) return;

        const options = button.hiddenSelectMenu?.options || [];
        if (options.length === 0) {
          await interaction.reply({
            content: "⚠️ You have no options configured for this select menu yet. Please add options first.",
            ephemeral: true,
          });
          return;
        }

        const previewSelect = new StringSelectMenuBuilder()
          .setCustomId("ticketpanel:preview_select_action")
          .setPlaceholder("Preview select menu...")
          .addOptions(
            options.map((o) => ({
              label: o.label,
              value: o.id,
              description: o.description || undefined,
              emoji: o.emoji || undefined,
            }))
          );

        const backBtn = new ButtonBuilder()
          .setCustomId(`ticketpanel:sel_menu_config:${buttonId}`)
          .setLabel("↩️ Back to Config")
          .setStyle(ButtonStyle.Secondary);

        await interaction.update({
          content: "👁️ **Dropdown Preview Mode**\n*This is what users see when they click the button.*",
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(previewSelect),
            new ActionRowBuilder().addComponents(backBtn),
          ],
        });
        return;
      }

      if (customId === "ticketpanel:embed_edit_req") {
        const config = db.getGuildConfig(guildId);
        const emb = config.embedSettings;

        const modal = new ModalBuilder()
          .setCustomId("ticketpanel:modal_edit_embed")
          .setTitle("Edit Panel Embed");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("title").setLabel("Embed Title").setStyle(TextInputStyle.Short).setValue(emb.title).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Embed Description").setStyle(TextInputStyle.Paragraph).setValue(emb.description).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("color").setLabel("Hex Color Code").setStyle(TextInputStyle.Short).setValue(emb.color).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("image").setLabel("Image URL (Optional)").setStyle(TextInputStyle.Short).setValue(emb.image || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("footer").setLabel("Footer Text (Optional)").setStyle(TextInputStyle.Short).setValue(emb.footer || "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === "ticketpanel:embed_preview") {
        const config = db.getGuildConfig(guildId);
        const emb = config.embedSettings;

        const previewEmbed = new EmbedBuilder()
          .setTitle(emb.title)
          .setDescription(emb.description)
          .setColor(emb.color || "#5865F2");

        if (emb.image) previewEmbed.setImage(emb.image);
        if (emb.footer) previewEmbed.setFooter({ text: emb.footer });

        const backBtn = new ButtonBuilder()
          .setCustomId("ticketpanel:main:embed") // Goes back to embed settings
          .setLabel("↩️ Back to Config")
          .setStyle(ButtonStyle.Secondary);

        const previewRow = new ActionRowBuilder();
        if (config.buttons.length === 0) {
          previewRow.addComponents(new ButtonBuilder().setCustomId("dummy").setLabel("Sample Button").setStyle(ButtonStyle.Primary).setDisabled(true));
        } else {
          config.buttons.slice(0, 5).forEach((b) => {
            const styles = {
              Primary: ButtonStyle.Primary,
              Secondary: ButtonStyle.Secondary,
              Success: ButtonStyle.Success,
              Danger: ButtonStyle.Danger,
            };
            const btn = new ButtonBuilder()
              .setCustomId(`dummy_${b.id}`)
              .setLabel(b.label)
              .setStyle(styles[b.style] || ButtonStyle.Primary)
              .setDisabled(true);
            if (b.emoji) btn.setEmoji(b.emoji);
            previewRow.addComponents(btn);
          });
        }

        await interaction.update({
          content: "👁️ **Panel Preview Mode**",
          embeds: [previewEmbed],
          components: [previewRow, new ActionRowBuilder().addComponents(backBtn)],
        });
        return;
      }

      if (customId === "ticketpanel:main:embed") {
        await interaction.update(renderEmbedSettingsMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:msg_btn_select") {
        const buttonId = interaction.values[0];
        await interaction.update(renderButtonTicketMessagesMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_menu:")) {
        const buttonId = customId.split(":")[2];
        await interaction.update(renderButtonTicketMessagesMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_edit_welcome:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const msgConfig = config.ticketMessages[buttonId] || {};

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_welcome:${buttonId}`)
          .setTitle("Edit Welcome Message");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("welcomeMessage")
              .setLabel("Welcome Text (Supports markdown)")
              .setStyle(TextInputStyle.Paragraph)
              .setValue(msgConfig.welcomeMessage || "Welcome to your ticket! A staff member will be with you shortly.")
              .setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_edit_embed:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const msgConfig = config.ticketMessages[buttonId] || {};
        const emb = msgConfig.embed || {};

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_embed:${buttonId}`)
          .setTitle("Edit In-Ticket Embed");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("title").setLabel("Embed Title").setStyle(TextInputStyle.Short).setValue(emb.title || "Ticket Support").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Embed Description").setStyle(TextInputStyle.Paragraph).setValue(emb.description || "Please explain your issue.").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("color").setLabel("Hex Color Code").setStyle(TextInputStyle.Short).setValue(emb.color || "#5865F2").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("image").setLabel("Image URL (Optional)").setStyle(TextInputStyle.Short).setValue(emb.image || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("footer").setLabel("Footer Text (Optional)").setStyle(TextInputStyle.Short).setValue(emb.footer || "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_edit_support_role:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const msgConfig = config.ticketMessages[buttonId] || {};

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_support:${buttonId}`)
          .setTitle("In-Ticket Support Role");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("supportRole")
              .setLabel("Support Role ID (Optional)")
              .setStyle(TextInputStyle.Short)
              .setValue(msgConfig.supportRole || "")
              .setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_toggle_rename:")) {
        const buttonId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        config.ticketMessages[buttonId] = config.ticketMessages[buttonId] || {
          welcomeMessage: "Welcome to your ticket! A staff member will be with you shortly.",
          embed: { title: "Ticket Support", description: "Please explain your issue in detail.", color: "#5865F2" },
          supportRole: null,
          renameOnClaim: true,
          insideButtons: []
        };
        config.ticketMessages[buttonId].renameOnClaim = !config.ticketMessages[buttonId].renameOnClaim;
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderButtonTicketMessagesMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_buttons_menu:")) {
        const buttonId = customId.split(":")[2];
        await interaction.update(renderInTicketButtonsMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_add_req:")) {
        const buttonId = customId.split(":")[2];
        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_add_btn:${buttonId}`)
          .setTitle("Add In-Ticket Button");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Button Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("style").setLabel("Style (Primary/Secondary/Success/Danger)").setStyle(TextInputStyle.Short).setValue("Primary").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("actionType").setLabel("Action Type (direct or selectMenu)").setStyle(TextInputStyle.Short).setValue("direct").setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("action").setLabel("Action (close/claim/addMember/notify/transcript)").setStyle(TextInputStyle.Short).setValue("close").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_configure_select:")) {
        const buttonId = customId.split(":")[2];
        const inBtnId = interaction.values[0];
        await interaction.update(renderInTicketButtonConfigMenu(guildId, userId, buttonId, inBtnId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_delete_select:")) {
        const buttonId = customId.split(":")[2];
        const inBtnId = interaction.values[0];
        const config = db.getGuildConfig(guildId);
        const msgConfig = config.ticketMessages[buttonId];

        if (msgConfig && msgConfig.insideButtons) {
          msgConfig.insideButtons = msgConfig.insideButtons.filter((b) => b.id !== inBtnId);
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderInTicketButtonsMenu(guildId, userId, buttonId));
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_edit_fields:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const inBtnId = parts[3];
        const config = db.getGuildConfig(guildId);
        const insideBtn = config.ticketMessages[buttonId]?.insideButtons?.find((b) => b.id === inBtnId);

        if (!insideBtn) return;

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_edit_btn:${buttonId}:${inBtnId}`)
          .setTitle("Edit In-Ticket Button");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Button Label").setStyle(TextInputStyle.Short).setValue(insideBtn.label).setRequired(true).setMaxLength(80)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setValue(insideBtn.emoji || "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("style").setLabel("Style (Primary/Secondary/Success/Danger)").setStyle(TextInputStyle.Short).setValue(insideBtn.style).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("action").setLabel("Action (close/claim/addMember/notify/transcript)").setStyle(TextInputStyle.Short).setValue(insideBtn.action).setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_opt_add:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const inBtnId = parts[3];

        const modal = new ModalBuilder()
          .setCustomId(`ticketpanel:modal_msg_btn_opt_add:${buttonId}:${inBtnId}`)
          .setTitle("Add Dropdown Option");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("label").setLabel("Option Label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(25)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("description").setLabel("Description (Optional)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("emoji").setLabel("Emoji (Optional)").setStyle(TextInputStyle.Short).setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("action").setLabel("Action (close/claim/addMember/notify/transcript)").setStyle(TextInputStyle.Short).setValue("close").setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId.startsWith("ticketpanel:msg_btn_opt_remove_select:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const inBtnId = parts[3];
        const optIdx = parseInt(interaction.values[0], 10);
        const config = db.getGuildConfig(guildId);
        const insideBtn = config.ticketMessages[buttonId]?.insideButtons?.find((b) => b.id === inBtnId);

        if (insideBtn && insideBtn.selectOptions) {
          insideBtn.selectOptions.splice(optIdx, 1);
          db.saveGuildConfig(guildId, config);
        }

        await interaction.update(renderInTicketButtonConfigMenu(guildId, userId, buttonId, inBtnId));
        return;
      }

      if (customId === "ticketpanel:gen_edit_limits") {
        const config = db.getGuildConfig(guildId);
        const gen = config.general;

        const modal = new ModalBuilder()
          .setCustomId("ticketpanel:modal_gen_limits")
          .setTitle("General Limits & settings");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("maxTickets").setLabel("Max Tickets Per User").setStyle(TextInputStyle.Short).setValue(String(gen.maxTicketsPerUser)).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("globalLimit").setLabel("Global Ticket Limit (Optional)").setStyle(TextInputStyle.Short).setValue(gen.globalLimit ? String(gen.globalLimit) : "").setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("autoClose").setLabel("Auto Close Inactivity Hours (Optional)").setStyle(TextInputStyle.Short).setValue(gen.autoCloseHours ? String(gen.autoCloseHours) : "").setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === "ticketpanel:gen_logs_select") {
        const channelId = interaction.values[0];
        const config = db.getGuildConfig(guildId);
        config.general.logsChannel = channelId;
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderGeneralSettingsMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:gen_toggle_transcript") {
        const config = db.getGuildConfig(guildId);
        config.general.transcriptEnabled = !config.general.transcriptEnabled;
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderGeneralSettingsMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:gen_toggle_reason") {
        const config = db.getGuildConfig(guildId);
        config.general.closeReasonPrompt = !config.general.closeReasonPrompt;
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderGeneralSettingsMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:gen_toggle_confirm") {
        const config = db.getGuildConfig(guildId);
        config.general.confirmOnClose = !config.general.confirmOnClose;
        db.saveGuildConfig(guildId, config);

        await interaction.update(renderGeneralSettingsMenu(guildId));
        return;
      }

      if (customId === "ticketpanel:send_channel_select") {
        const channelId = interaction.values[0];
        const config = db.getGuildConfig(guildId);

        if (config.buttons.length === 0) {
          await interaction.reply({
            content: "❌ You cannot publish the panel with 0 buttons configured. Please add buttons first.",
            ephemeral: true,
          });
          return;
        }

        const confirmBtn = new ButtonBuilder()
          .setCustomId(`ticketpanel:send_confirm:${channelId}`)
          .setLabel("Confirm & Send Panel")
          .setStyle(ButtonStyle.Success);

        const cancelBtn = new ButtonBuilder()
          .setCustomId("ticketpanel:back_to_main")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary);

        await interaction.update({
          content: `📤 **Are you sure you want to publish the Ticket Panel to <#${channelId}>?**\n*This will send the public embed and components to that channel.*`,
          embeds: [],
          components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
        });
        return;
      }

      if (customId.startsWith("ticketpanel:send_confirm:")) {
        const channelId = customId.split(":")[2];
        const config = db.getGuildConfig(guildId);
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
          await interaction.update({
            content: "❌ Error: Channel not found or bot does not have access.",
            components: [],
          });
          return;
        }

        const emb = config.embedSettings;
        const mainEmbed = new EmbedBuilder()
          .setTitle(emb.title)
          .setDescription(emb.description)
          .setColor(emb.color || "#5865F2");

        if (emb.image) mainEmbed.setImage(emb.image);
        if (emb.footer) mainEmbed.setFooter({ text: emb.footer });

        const actionRows = [];
        let currentRow = new ActionRowBuilder();

        config.buttons.forEach((b, idx) => {
          if (currentRow.components.length >= 5) {
            actionRows.push(currentRow);
            currentRow = new ActionRowBuilder();
          }

          const styles = {
            Primary: ButtonStyle.Primary,
            Secondary: ButtonStyle.Secondary,
            Success: ButtonStyle.Success,
            Danger: ButtonStyle.Danger,
          };

          const buttonComp = new ButtonBuilder()
            .setCustomId(`ticket_open_btn:${b.id}`)
            .setLabel(b.label)
            .setStyle(styles[b.style] || ButtonStyle.Primary);

          if (b.emoji) buttonComp.setEmoji(b.emoji);
          currentRow.addComponents(buttonComp);
        });

        if (currentRow.components.length > 0) {
          actionRows.push(currentRow);
        }

        try {
          await channel.send({ embeds: [mainEmbed], components: actionRows });
          await interaction.update({
            content: `✅ **Ticket Panel successfully published to <#${channelId}>!**`,
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("Return to Main Menu").setStyle(ButtonStyle.Secondary))],
          });
        } catch (error) {
          console.error("Failed to send ticket panel:", error);
          await interaction.update({
            content: `❌ **Failed to send panel:** ${error.message}`,
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticketpanel:back_to_main").setLabel("Return to Main Menu").setStyle(ButtonStyle.Secondary))],
          });
        }
        return;
      }

      if (customId.startsWith("ticket_open_btn:")) {
        const buttonId = customId.split(":")[1];
        await handleTicketOpenRequest(interaction, buttonId, null);
        return;
      }

      if (customId.startsWith("ticket_open_confirm_yes:")) {
        const parts = customId.split(":");
        const buttonId = parts[1];
        const optId = parts[2] !== "null" ? parts[2] : null;
        await handleTicketOpenFlow(interaction, buttonId, optId);
        return;
      }

      if (customId.startsWith("ticket_open_confirm_no:")) {
        await interaction.update({
          content: "🚫 Ticket creation cancelled.",
          embeds: [],
          components: [],
        });
        return;
      }

      if (customId === "ticket:claim") {
        await handleTicketClaim(interaction);
        return;
      }

      if (customId === "ticket:close") {
        await handleTicketCloseRequest(interaction);
        return;
      }

      if (customId === "ticket:close_confirm") {
        await handleTicketCloseConfirm(interaction);
        return;
      }

      if (customId === "ticket:close_cancel") {
        await interaction.update({
          content: "🚫 Ticket closure cancelled.",
          components: [],
        });
        return;
      }

      if (customId === "ticket:delete") {
        await handleTicketDelete(interaction);
        return;
      }

      if (customId === "ticket:export_transcript") {
        await handleTicketTranscriptExport(interaction);
        return;
      }

      if (customId === "ticket:add_member") {
        const modal = new ModalBuilder()
          .setCustomId("ticket:modal_add_member_submit")
          .setTitle("Add Member to Ticket");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("userId").setLabel("Discord User ID").setStyle(TextInputStyle.Short).setRequired(true)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === "ticket:notify") {
        await handleTicketNotify(interaction);
        return;
      }

      if (customId === "ticket:transcript") {
        await handleTicketTranscriptInline(interaction);
        return;
      }

      if (customId.startsWith("ticket_open_sel:")) {
        const buttonId = customId.split(":")[1];
        const optionId = interaction.values[0];
        await handleTicketOpenRequest(interaction, buttonId, optionId);
        return;
      }

      if (customId === "ticket:select_action") {
        const action = interaction.values[0];
        if (action === "close") await handleTicketCloseRequest(interaction);
        else if (action === "claim") await handleTicketClaim(interaction);
        else if (action === "addMember") {
          const modal = new ModalBuilder()
            .setCustomId("ticket:modal_add_member_submit")
            .setTitle("Add Member to Ticket");
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("userId").setLabel("Discord User ID").setStyle(TextInputStyle.Short).setRequired(true))
          );
          await interaction.showModal(modal);
        } else if (action === "notify") await handleTicketNotify(interaction);
        else if (action === "transcript") await handleTicketTranscriptInline(interaction);
        return;
      }
    },
  },
];

const modalHandlers = [
  {
    matches(customId) {
      return customId.startsWith("ticketpanel:") || customId.startsWith("ticket:") || customId.startsWith("ticket_");
    },
    async execute(interaction) {
      const guildId = interaction.guildId;
      const userId = interaction.user.id;
      const customId = interaction.customId;

      if (customId.startsWith("ticketpanel:")) {
        if (!isAdmin(interaction)) {
          await interaction.reply({
            content: "❌ You don't have permission to perform this configuration.",
            ephemeral: true,
          });
          return;
        }
      }

      if (customId === "ticketpanel:modal_add_btn") {
        const label = interaction.fields.getTextInputValue("label").trim();
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const style = interaction.fields.getTextInputValue("style").trim();
        const categoryId = interaction.fields.getTextInputValue("category").trim() || null;
        const channelNameFormat = interaction.fields.getTextInputValue("format").trim() || "ticket-{username}";

        const config = db.getGuildConfig(guildId);
        const buttonId = generateId();

        config.buttons.push({
          id: buttonId,
          label,
          emoji,
          style: ["Primary", "Secondary", "Success", "Danger"].includes(style) ? style : "Primary",
          categoryId,
          channelNameFormat,
          questions: [],
          hiddenSelectMenu: { enabled: false, options: [] },
          requiredRole: null,
          cooldownSeconds: null,
          maxTicketsForThisButton: null,
          confirmBeforeOpen: false,
          supportRole: null,
        });

        config.ticketMessages[buttonId] = {
          welcomeMessage: "Welcome to your ticket! A staff member will be with you shortly.",
          embed: {
            title: "Ticket Support",
            description: "Please explain your issue in detail.",
            color: "#5865F2",
            image: null,
            footer: null,
          },
          supportRole: null,
          renameOnClaim: true,
          insideButtons: [],
        };

        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ Button **${label}** added successfully!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_edit_btn:")) {
        const buttonId = customId.split(":")[2];
        const label = interaction.fields.getTextInputValue("label").trim();
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const style = interaction.fields.getTextInputValue("style").trim();
        const categoryId = interaction.fields.getTextInputValue("category").trim() || null;
        const channelNameFormat = interaction.fields.getTextInputValue("format").trim();

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.label = label;
          button.emoji = emoji;
          button.style = ["Primary", "Secondary", "Success", "Danger"].includes(style) ? style : "Primary";
          button.categoryId = categoryId;
          button.channelNameFormat = channelNameFormat;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Button settings updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_edit_cond:")) {
        const buttonId = customId.split(":")[2];
        const requiredRole = interaction.fields.getTextInputValue("requiredRole").trim() || null;
        const cooldownStr = interaction.fields.getTextInputValue("cooldown").trim();
        const maxTicketsStr = interaction.fields.getTextInputValue("maxTickets").trim();

        const cooldownSeconds = cooldownStr ? parseInt(cooldownStr, 10) : null;
        const maxTicketsForThisButton = maxTicketsStr ? parseInt(maxTicketsStr, 10) : null;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.requiredRole = requiredRole;
          button.cooldownSeconds = isNaN(cooldownSeconds) ? null : cooldownSeconds;
          button.maxTicketsForThisButton = isNaN(maxTicketsForThisButton) ? null : maxTicketsForThisButton;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Conditions updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_edit_support:")) {
        const buttonId = customId.split(":")[2];
        const supportRole = interaction.fields.getTextInputValue("supportRole").trim() || null;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.supportRole = supportRole;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Support role configured!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_add_q:")) {
        const buttonId = customId.split(":")[2];
        const question = interaction.fields.getTextInputValue("question").trim();
        const type = interaction.fields.getTextInputValue("type").trim().toLowerCase() === "paragraph" ? "paragraph" : "short";
        const required = ["no", "false"].includes(interaction.fields.getTextInputValue("required").trim().toLowerCase()) ? false : true;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.questions = button.questions || [];
          button.questions.push({ question, type, required });
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Question added!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_add_opt:")) {
        const buttonId = customId.split(":")[2];
        const label = interaction.fields.getTextInputValue("label").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const categoryId = interaction.fields.getTextInputValue("category").trim() || null;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);

        if (button) {
          button.hiddenSelectMenu = button.hiddenSelectMenu || { enabled: false, options: [] };
          button.hiddenSelectMenu.options.push({
            id: generateId(),
            label,
            description,
            emoji,
            categoryId,
            questions: [],
          });
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Option **${label}** added successfully!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_edit_opt:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        const label = interaction.fields.getTextInputValue("label").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const categoryId = interaction.fields.getTextInputValue("category").trim() || null;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId);

        if (option) {
          option.label = label;
          option.description = description;
          option.emoji = emoji;
          option.categoryId = categoryId;
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Option settings updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_opt_add_q:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const optionId = parts[3];
        const question = interaction.fields.getTextInputValue("question").trim();
        const type = interaction.fields.getTextInputValue("type").trim().toLowerCase() === "paragraph" ? "paragraph" : "short";
        const required = ["no", "false"].includes(interaction.fields.getTextInputValue("required").trim().toLowerCase()) ? false : true;

        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId);

        if (option) {
          option.questions = option.questions || [];
          option.questions.push({ question, type, required });
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Option question added!`,
          ephemeral: true,
        });
        return;
      }

      if (customId === "ticketpanel:modal_edit_embed") {
        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim();
        const color = interaction.fields.getTextInputValue("color").trim();
        const image = interaction.fields.getTextInputValue("image").trim() || null;
        const footer = interaction.fields.getTextInputValue("footer").trim() || null;

        const config = db.getGuildConfig(guildId);
        config.embedSettings = { title, description, color, image, footer };
        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ Panel Embed details updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_welcome:")) {
        const buttonId = customId.split(":")[2];
        const welcomeMessage = interaction.fields.getTextInputValue("welcomeMessage").trim();

        const config = db.getGuildConfig(guildId);
        config.ticketMessages[buttonId] = config.ticketMessages[buttonId] || {};
        config.ticketMessages[buttonId].welcomeMessage = welcomeMessage;
        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ Welcome Message updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_embed:")) {
        const buttonId = customId.split(":")[2];
        const title = interaction.fields.getTextInputValue("title").trim();
        const description = interaction.fields.getTextInputValue("description").trim();
        const color = interaction.fields.getTextInputValue("color").trim();
        const image = interaction.fields.getTextInputValue("image").trim() || null;
        const footer = interaction.fields.getTextInputValue("footer").trim() || null;

        const config = db.getGuildConfig(guildId);
        config.ticketMessages[buttonId] = config.ticketMessages[buttonId] || {};
        config.ticketMessages[buttonId].embed = { title, description, color, image, footer };
        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ In-Ticket Embed updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_support:")) {
        const buttonId = customId.split(":")[2];
        const supportRole = interaction.fields.getTextInputValue("supportRole").trim() || null;

        const config = db.getGuildConfig(guildId);
        config.ticketMessages[buttonId] = config.ticketMessages[buttonId] || {};
        config.ticketMessages[buttonId].supportRole = supportRole;
        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ In-Ticket linked support role configured!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_add_btn:")) {
        const buttonId = customId.split(":")[2];
        const label = interaction.fields.getTextInputValue("label").trim();
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const style = interaction.fields.getTextInputValue("style").trim();
        const actionType = interaction.fields.getTextInputValue("actionType").trim().toLowerCase() === "selectmenu" ? "selectMenu" : "direct";
        const action = interaction.fields.getTextInputValue("action").trim();

        const config = db.getGuildConfig(guildId);
        config.ticketMessages[buttonId] = config.ticketMessages[buttonId] || {};
        config.ticketMessages[buttonId].insideButtons = config.ticketMessages[buttonId].insideButtons || [];

        config.ticketMessages[buttonId].insideButtons.push({
          id: generateId(),
          label,
          emoji,
          style: ["Primary", "Secondary", "Success", "Danger"].includes(style) ? style : "Primary",
          actionType,
          action: ["close", "claim", "addMember", "notify", "transcript"].includes(action) ? action : "close",
          selectOptions: [],
        });

        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ In-Ticket button added!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_edit_btn:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const inBtnId = parts[3];
        const label = interaction.fields.getTextInputValue("label").trim();
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const style = interaction.fields.getTextInputValue("style").trim();
        const action = interaction.fields.getTextInputValue("action").trim();

        const config = db.getGuildConfig(guildId);
        const insideBtn = config.ticketMessages[buttonId]?.insideButtons?.find((b) => b.id === inBtnId);

        if (insideBtn) {
          insideBtn.label = label;
          insideBtn.emoji = emoji;
          insideBtn.style = ["Primary", "Secondary", "Success", "Danger"].includes(style) ? style : "Primary";
          insideBtn.action = ["close", "claim", "addMember", "notify", "transcript"].includes(action) ? action : "close";
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ In-Ticket button settings updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticketpanel:modal_msg_btn_opt_add:")) {
        const parts = customId.split(":");
        const buttonId = parts[2];
        const inBtnId = parts[3];
        const label = interaction.fields.getTextInputValue("label").trim();
        const description = interaction.fields.getTextInputValue("description").trim() || null;
        const emoji = interaction.fields.getTextInputValue("emoji").trim() || null;
        const action = interaction.fields.getTextInputValue("action").trim();

        const config = db.getGuildConfig(guildId);
        const insideBtn = config.ticketMessages[buttonId]?.insideButtons?.find((b) => b.id === inBtnId);

        if (insideBtn) {
          insideBtn.selectOptions = insideBtn.selectOptions || [];
          insideBtn.selectOptions.push({
            label,
            description,
            emoji,
            action: ["close", "claim", "addMember", "notify", "transcript"].includes(action) ? action : "close",
          });
          db.saveGuildConfig(guildId, config);
        }

        await interaction.reply({
          content: `✅ Dropdown option added!`,
          ephemeral: true,
        });
        return;
      }

      if (customId === "ticketpanel:modal_gen_limits") {
        const maxTickets = parseInt(interaction.fields.getTextInputValue("maxTickets").trim(), 10);
        const globalLimitStr = interaction.fields.getTextInputValue("globalLimit").trim();
        const autoCloseStr = interaction.fields.getTextInputValue("autoClose").trim();

        const globalLimit = globalLimitStr ? parseInt(globalLimitStr, 10) : null;
        const autoCloseHours = autoCloseStr ? parseInt(autoCloseStr, 10) : null;

        const config = db.getGuildConfig(guildId);
        config.general.maxTicketsPerUser = isNaN(maxTickets) ? 3 : maxTickets;
        config.general.globalLimit = isNaN(globalLimit) ? null : globalLimit;
        config.general.autoCloseHours = isNaN(autoCloseHours) ? null : autoCloseHours;

        db.saveGuildConfig(guildId, config);

        await interaction.reply({
          content: `✅ General server limits updated!`,
          ephemeral: true,
        });
        return;
      }

      if (customId.startsWith("ticket_modal_submit:")) {
        const buttonId = customId.split(":")[1];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        if (!button) return;

        const answers = [];
        button.questions.forEach((q, idx) => {
          const val = interaction.fields.getTextInputValue(`q_${idx}`);
          answers.push({ question: q.question, answer: val });
        });

        await handleTicketCreation(interaction, button, null, answers);
        return;
      }

      if (customId.startsWith("ticket_modal_submit_opt:")) {
        const parts = customId.split(":");
        const buttonId = parts[1];
        const optId = parts[2];
        const config = db.getGuildConfig(guildId);
        const button = config.buttons.find((b) => b.id === buttonId);
        const option = button?.hiddenSelectMenu?.options?.find((o) => o.id === optId);
        if (!option) return;

        const answers = [];
        option.questions.forEach((q, idx) => {
          const val = interaction.fields.getTextInputValue(`q_${idx}`);
          answers.push({ question: q.question, answer: val });
        });

        await handleTicketCreation(interaction, button, option, answers);
        return;
      }

      if (customId === "ticket:modal_close_reason_submit") {
        const reason = interaction.fields.getTextInputValue("reason").trim() || "No reason provided";
        await executeTicketClose(interaction, reason);
        return;
      }

      if (customId === "ticket:modal_add_member_submit") {
        const targetUserId = interaction.fields.getTextInputValue("userId").trim();
        try {
          const member = await interaction.guild.members.fetch(targetUserId);
          if (!member) {
            await interaction.reply({ content: "❌ Member not found in this server.", ephemeral: true });
            return;
          }

          await interaction.channel.permissionOverwrites.edit(targetUserId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });

          await interaction.reply({
            content: `✅ Added ${member} to the ticket channel.`,
          });
        } catch (err) {
          await interaction.reply({
            content: `❌ Failed to add member. Make sure ID is correct. Details: ${err.message}`,
            ephemeral: true,
          });
        }
        return;
      }
    },
  },
];

async function handleTicketOpenRequest(interaction, buttonId, optionId) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);

  if (!button) {
    await interaction.reply({ content: "❌ This button configuration was not found.", ephemeral: true });
    return;
  }

  const cdKey = `${userId}-${buttonId}`;
  if (button.cooldownSeconds) {
    const expires = cooldowns.get(cdKey);
    if (expires && Date.now() < expires) {
      const remaining = Math.ceil((expires - Date.now()) / 1000);
      await interaction.reply({
        content: `❌ You are on cooldown for this button! Please wait **${remaining}** more seconds.`,
        ephemeral: true,
      });
      return;
    }
  }

  if (button.requiredRole) {
    if (!interaction.member.roles.cache.has(button.requiredRole)) {
      await interaction.reply({
        content: `❌ You must have the <@&${button.requiredRole}> role to use this button.`,
        ephemeral: true,
      });
      return;
    }
  }

  const openTickets = (config.activeTickets || []).filter((t) => t.userId === userId && t.status === "open");
  if (openTickets.length >= config.general.maxTicketsPerUser) {
    await interaction.reply({
      content: `❌ You have reached the limit of open tickets per user (\`${config.general.maxTicketsPerUser}\`).`,
      ephemeral: true,
    });
    return;
  }

  if (button.maxTicketsForThisButton) {
    const buttonOpenTickets = openTickets.filter((t) => t.buttonId === buttonId);
    if (buttonOpenTickets.length >= button.maxTicketsForThisButton) {
      await interaction.reply({
        content: `❌ You have reached the ticket limit specifically for this button (\`${button.maxTicketsForThisButton}\`).`,
        ephemeral: true,
      });
      return;
    }
  }

  if (config.general.globalLimit) {
    const allOpenTickets = (config.activeTickets || []).filter((t) => t.status === "open");
    if (allOpenTickets.length >= config.general.globalLimit) {
      await interaction.reply({
        content: "❌ The support desk is currently full. Please try again later.",
        ephemeral: true,
      });
      return;
    }
  }

  if (button.hiddenSelectMenu?.enabled && !optionId) {
    const options = button.hiddenSelectMenu.options || [];
    if (options.length === 0) {
      await interaction.reply({
        content: "⚠️ The select menu configuration is empty. Contact staff.",
        ephemeral: true,
      });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`ticket_open_sel:${buttonId}`)
      .setPlaceholder("Choose a department/topic...")
      .addOptions(
        options.map((o) => ({
          label: o.label,
          value: o.id,
          description: o.description || undefined,
          emoji: o.emoji || undefined,
        }))
      );

    await interaction.reply({
      content: "📋 Please select an option from the menu below to open your ticket:",
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true,
    });
    return;
  }

  if (button.confirmBeforeOpen) {
    const yesBtn = new ButtonBuilder()
      .setCustomId(`ticket_open_confirm_yes:${buttonId}:${optionId || "null"}`)
      .setLabel("Yes, Open Ticket")
      .setStyle(ButtonStyle.Success);

    const noBtn = new ButtonBuilder()
      .setCustomId(`ticket_open_confirm_no:${buttonId}`)
      .setLabel("No, Cancel")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(yesBtn, noBtn);

    const embed = new EmbedBuilder()
      .setTitle("🎫 Confirm Ticket Creation")
      .setDescription("Are you sure you want to open a support ticket?")
      .setColor("#E67E22");

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "", embeds: [embed], components: [row], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
    return;
  }

  await handleTicketOpenFlow(interaction, buttonId, optionId);
}

async function handleTicketOpenFlow(interaction, buttonId, optionId) {
  const guildId = interaction.guildId;
  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === buttonId);
  const option = optionId ? button?.hiddenSelectMenu?.options?.find((o) => o.id === optionId) : null;

  if (!button) return;

  const questions = option ? (option.questions || []) : (button.questions || []);

  if (questions.length > 0) {

    const modalId = option
      ? `ticket_modal_submit_opt:${buttonId}:${optionId}`
      : `ticket_modal_submit:${buttonId}`;

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Pre-Ticket Questions");

    questions.forEach((q, idx) => {
      const input = new TextInputBuilder()
        .setCustomId(`q_${idx}`)
        .setLabel(q.question.substring(0, 45))
        .setStyle(q.type === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    await interaction.showModal(modal);
  } else {

    await handleTicketCreation(interaction, button, option, []);
  }
}

async function handleTicketCreation(interaction, button, option, answers) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user = interaction.user;
  const guildId = guild.id;
  const config = db.getGuildConfig(guildId);

  if (button.cooldownSeconds) {
    const cdKey = `${user.id}-${button.id}`;
    cooldowns.set(cdKey, Date.now() + button.cooldownSeconds * 1000);
  }

  const categoryId = option?.categoryId || button.categoryId || null;

  const format = button.channelNameFormat || "ticket-{username}";
  let channelName = format
    .replace("{username}", user.username.toLowerCase())
    .replace("{userid}", user.id);

  channelName = channelName.replace(/[^a-zA-Z0-9-]/g, ""); // strip invalid characters

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  const msgConfig = config.ticketMessages[button.id] || {};
  const linkedSupportRole = msgConfig.supportRole || button.supportRole || null;

  if (linkedSupportRole) {
    permissionOverwrites.push({
      id: linkedSupportRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  try {
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites,
    });

    const ticketData = {
      channelId: channel.id,
      userId: user.id,
      buttonId: button.id,
      selectOptionId: option?.id || null,
      status: "open",
      claimedBy: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      answers: answers || [],
    };
    db.addActiveTicket(guildId, ticketData);

    const welcomeText = msgConfig.welcomeMessage
      ? msgConfig.welcomeMessage.replace("{user}", `<@${user.id}>`)
      : `Welcome to your ticket <@${user.id}>! A staff member will be with you shortly.`;

    const embedSet = msgConfig.embed || {
      title: "Support Ticket",
      description: "Please explain your issue in detail.",
      color: "#5865F2",
    };

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(embedSet.title)
      .setDescription(embedSet.description)
      .setColor(embedSet.color || "#5865F2")
      .setTimestamp();

    if (embedSet.image) welcomeEmbed.setImage(embedSet.image);
    if (embedSet.footer) welcomeEmbed.setFooter({ text: embedSet.footer });

    if (answers && answers.length > 0) {
      let answersString = "";
      answers.forEach((ans) => {
        answersString += `**Question:** ${ans.question}\n**Answer:** ${ans.answer}\n\n`;
      });
      welcomeEmbed.addFields({ name: "📋 Submitted Answers", value: answersString });
    }

    const components = [];
    if (msgConfig.insideButtons && msgConfig.insideButtons.length > 0) {
      let row = new ActionRowBuilder();
      msgConfig.insideButtons.slice(0, 5).forEach((btn) => {
        const styles = {
          Primary: ButtonStyle.Primary,
          Secondary: ButtonStyle.Secondary,
          Success: ButtonStyle.Success,
          Danger: ButtonStyle.Danger,
        };

        if (btn.actionType === "direct") {
          const comp = new ButtonBuilder()
            .setCustomId(`ticket:${btn.action}`)
            .setLabel(btn.label)
            .setStyle(styles[btn.style] || ButtonStyle.Primary);
          if (btn.emoji) comp.setEmoji(btn.emoji);
          row.addComponents(comp);
        } else if (btn.actionType === "selectMenu" && btn.selectOptions && btn.selectOptions.length > 0) {
          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("ticket:select_action")
            .setPlaceholder(btn.label.substring(0, 25))
            .addOptions(
              btn.selectOptions.map((opt) => ({
                label: opt.label,
                value: opt.action,
                description: opt.description || undefined,
                emoji: opt.emoji || undefined,
              }))
            );
          components.push(new ActionRowBuilder().addComponents(selectMenu));
        }
      });
      if (row.components.length > 0) {
        components.unshift(row);
      }
    } else {

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket:claim").setLabel("🙋‍♂️ Claim").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("ticket:close").setLabel("🔒 Close").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket:add_member").setLabel("👤 Member").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket:notify").setLabel("🔔 Notify").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("ticket:transcript").setLabel("📜 Transcript").setStyle(ButtonStyle.Secondary)
      );
      components.push(row);
    }

    const pingText = linkedSupportRole ? `<@&${linkedSupportRole}>` : "";
    await channel.send({
      content: `${welcomeText}\n${pingText}`,
      embeds: [welcomeEmbed],
      components,
    });

    if (config.general.logsChannel) {
      const logsChan = guild.channels.cache.get(config.general.logsChannel);
      if (logsChan) {
        const logEmbed = new EmbedBuilder()
          .setTitle("🎫 Ticket Created")
          .setDescription(
            `• **Channel:** <#${channel.id}>\n` +
            `• **Opened By:** ${user} (ID: \`${user.id}\`)\n` +
            `• **Button Used:** \`${button.label}\`` +
            (option ? `\n• **Option Selected:** \`${option.label}\`` : "")
          )
          .setColor("#57F287")
          .setTimestamp();
        await logsChan.send({ embeds: [logEmbed] });
      }
    }

    await interaction.editReply({
      content: `✅ Your ticket channel has been created: <#${channel.id}>.`,
    });
  } catch (error) {
    console.error("Failed to create ticket channel:", error);
    await interaction.editReply({
      content: `❌ Failed to create ticket: ${error.message}`,
    });
  }
}

async function handleTicketClaim(interaction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const user = interaction.user;
  const ticket = db.getActiveTicket(guildId, channel.id);

  if (!ticket) {
    await interaction.reply({ content: "❌ Ticket data not found in DB.", ephemeral: true });
    return;
  }

  if (ticket.claimedBy) {
    await interaction.reply({ content: `❌ This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
    return;
  }

  db.updateActiveTicket(guildId, channel.id, { claimedBy: user.id, lastActivity: Date.now() });
  db.incrementClaimCount(guildId, user.id);

  try {
    const rows = interaction.message.components.map((row) => {
      const newRow = ActionRowBuilder.from(row);
      newRow.components.forEach((comp) => {
        if (comp.data.custom_id === "ticket:claim") {
          comp.setDisabled(true).setLabel(`Claimed by ${user.username}`).setStyle(ButtonStyle.Success);
        }
      });
      return newRow;
    });
    await interaction.update({ components: rows });
  } catch {

    if (!interaction.replied) {
      await interaction.deferUpdate();
    }
  }

  await channel.send({ content: `🙋‍♂️ **This ticket is now claimed by ${user}!**` });

  const config = db.getGuildConfig(guildId);
  const button = config.buttons.find((b) => b.id === ticket.buttonId);
  const msgConfig = config.ticketMessages[button?.id] || {};

  if (msgConfig.renameOnClaim !== false) {
    try {
      await channel.setName(`claimed-${user.username}`);
    } catch (err) {
      console.warn("Failed to rename channel on claim (Rate Limit?):", err.message);
    }
  }
}

async function handleTicketCloseRequest(interaction) {
  const guildId = interaction.guildId;
  const config = db.getGuildConfig(guildId);

  if (config.general.confirmOnClose) {
    const confirmBtn = new ButtonBuilder()
      .setCustomId("ticket:close_confirm")
      .setLabel("Yes, Close Ticket")
      .setStyle(ButtonStyle.Danger);

    const cancelBtn = new ButtonBuilder()
      .setCustomId("ticket:close_cancel")
      .setLabel("No, Cancel")
      .setStyle(ButtonStyle.Secondary);

    await interaction.reply({
      content: "⚠️ **Are you sure you want to close this ticket?**",
      components: [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)],
    });
  } else {
    await handleTicketCloseConfirm(interaction);
  }
}

async function handleTicketCloseConfirm(interaction) {
  const guildId = interaction.guildId;
  const config = db.getGuildConfig(guildId);

  if (config.general.closeReasonPrompt) {
    const modal = new ModalBuilder()
      .setCustomId("ticket:modal_close_reason_submit")
      .setTitle("Close Reason");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel("Reason for Closure").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(250)
      )
    );

    await interaction.showModal(modal);
  } else {
    await executeTicketClose(interaction, "No reason specified.");
  }
}

async function executeTicketClose(interaction, reason) {

  const isDeferred = interaction.deferred || interaction.replied;
  if (!isDeferred) {
    await interaction.deferReply();
  }

  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const closer = interaction.user;
  const config = db.getGuildConfig(guildId);
  const ticket = db.getActiveTicket(guildId, channel.id);

  if (!ticket) {
    const errObj = { content: "❌ Ticket information not found in DB." };
    if (isDeferred) await interaction.followUp(errObj);
    else await interaction.reply(errObj);
    return;
  }

  db.updateActiveTicket(guildId, channel.id, { status: "closed", lastActivity: Date.now() });

  try {
    await channel.permissionOverwrites.edit(ticket.userId, {
      ViewChannel: false,
    });
  } catch (err) {
    console.error("Failed to revoke permissions for opener:", err.message);
  }

  try {
    await channel.setName(`closed-${channel.name.replace("claimed-", "").replace("ticket-", "")}`);
  } catch (err) {
    console.warn("Failed to rename channel to closed:", err.message);
  }

  let transcriptAttachment;
  if (config.general.transcriptEnabled) {
    try {
      transcriptAttachment = await generateTranscript(channel, ticket, closer, reason);
    } catch (err) {
      console.error("Failed to generate transcript:", err.message);
    }
  }

  try {
    const owner = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    if (owner) {
      const dmEmbed = new EmbedBuilder()
        .setTitle("🔒 Your Ticket Has Been Closed")
        .setDescription(
          `Your ticket in **${interaction.guild.name}** has been closed.\n\n` +
          `• **Ticket Name:** \`#${channel.name}\`\n` +
          `• **Closed By:** ${closer.tag} (${closer.id})\n` +
          `• **Reason:** \`${reason}\``
        )
        .setColor("#FF0000")
        .setTimestamp();

      if (transcriptAttachment) {
        const dmTranscript = new AttachmentBuilder(transcriptAttachment.attachment, { name: transcriptAttachment.name });
        await owner.send({ embeds: [dmEmbed], files: [dmTranscript] }).catch(() => {
          console.log(`Failed to send DM to ticket owner ${ticket.userId} (DMs might be closed).`);
        });
      } else {
        await owner.send({ embeds: [dmEmbed] }).catch(() => {
          console.log(`Failed to send DM to ticket owner ${ticket.userId} (DMs might be closed).`);
        });
      }

      try {
        await reviewService.sendReviewRequest(interaction.client, interaction.guild, ticket.userId, channel.name);
      } catch (revErr) {
        console.error("Error sending review request DM:", revErr.message);
      }
    }
  } catch (dmErr) {
    console.error("Error sending DM to ticket owner:", dmErr.message);
  }

  if (config.general.logsChannel) {
    const logsChan = interaction.guild.channels.cache.get(config.general.logsChannel);
    if (logsChan) {
      const logEmbed = new EmbedBuilder()
        .setTitle("🔒 Ticket Closed")
        .setDescription(
          `• **Ticket:** \`#${channel.name}\`\n` +
          `• **Opened By:** <@${ticket.userId}> (ID: \`${ticket.userId}\`)\n` +
          `• **Closed By:** ${closer} (ID: \`${closer.id}\`)\n` +
          `• **Reason:** \`${reason}\``
        )
        .setColor("#FF0000")
        .setTimestamp();

      if (transcriptAttachment) {
        await logsChan.send({ embeds: [logEmbed], files: [transcriptAttachment] });
      } else {
        await logsChan.send({ embeds: [logEmbed] });
      }
    }
  }

  const closedEmbed = new EmbedBuilder()
    .setTitle("🔒 Ticket Closed")
    .setDescription(`This ticket was closed by ${closer}.\n**Reason:** ${reason}\n\n*Opener permissions have been revoked. Staff can export transcripts or delete the channel below.*`)
    .setColor("#95A5A6")
    .setTimestamp();

  const deleteBtn = new ButtonBuilder()
    .setCustomId("ticket:delete")
    .setLabel("🗑️ Delete Ticket")
    .setStyle(ButtonStyle.Danger);

  const exportBtn = new ButtonBuilder()
    .setCustomId("ticket:export_transcript")
    .setLabel("📜 Export Transcript")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(deleteBtn, exportBtn);

  if (isDeferred) {
    await interaction.followUp({ content: "🔒 Ticket Closed.", embeds: [closedEmbed], components: [row] });
  } else {
    await interaction.editReply({ embeds: [closedEmbed], components: [row] });
  }
}

async function handleTicketDelete(interaction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;

  await interaction.reply("🗑️ **Deleting channel in 5 seconds...**");

  setTimeout(async () => {
    try {
      db.removeActiveTicket(guildId, channel.id);
      await channel.delete("Ticket Deleted by staff.");
    } catch (err) {
      console.error("Failed to delete channel:", err);
    }
  }, 5000);
}

async function handleTicketTranscriptExport(interaction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const ticket = db.getActiveTicket(guildId, channel.id);

  if (!ticket) {
    await interaction.reply({ content: "❌ Ticket information not found in DB.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  try {
    const transcriptAttachment = await generateTranscript(channel, ticket, interaction.user, "Requested Export");
    await interaction.followUp({
      content: "📜 Here is the transcript of this ticket channel:",
      files: [transcriptAttachment],
    });
  } catch (err) {
    await interaction.followUp({ content: `❌ Failed to export transcript: ${err.message}` });
  }
}

async function handleTicketTranscriptInline(interaction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const ticket = db.getActiveTicket(guildId, channel.id);

  if (!ticket) {
    await interaction.reply({ content: "❌ Ticket data not found in DB.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  try {
    const transcriptAttachment = await generateTranscript(channel, ticket, null, "Manual Export inside channel");
    await interaction.followUp({
      content: "📜 **Ticket Transcript Exported:**",
      files: [transcriptAttachment],
    });
  } catch (err) {
    await interaction.followUp({ content: `❌ Failed to generate transcript: ${err.message}` });
  }
}

async function handleTicketNotify(interaction) {
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const ticket = db.getActiveTicket(guildId, channel.id);

  if (!ticket) {
    await interaction.reply({ content: "❌ Ticket data not found.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `🔔 <@${ticket.userId}>, staff is waiting for your response!`,
  });
}

async function generateTranscript(channel, ticketInfo, closerUser = null, reason = null) {
  let messages = [];
  let lastId;
  try {
    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      const fetched = await channel.messages.fetch(options);
      if (fetched.size === 0) break;
      messages.push(...fetched.values());
      lastId = fetched.last().id;
      if (fetched.size < 100) break;
    }
  } catch (err) {
    console.error("Error fetching messages for transcript:", err);
  }
  messages.reverse();

  let text = `=== Ticket Transcript: ${channel.name} ===\n`;
  text += `Guild ID: ${channel.guild.id}\n`;
  text += `Channel ID: ${channel.id}\n`;
  text += `Opened by User ID: ${ticketInfo.userId}\n`;
  text += `Created at: ${new Date(ticketInfo.createdAt).toUTCString()}\n`;
  if (ticketInfo.claimedBy) {
    text += `Claimed by User ID: ${ticketInfo.claimedBy}\n`;
  }
  if (closerUser) {
    text += `Closed by: ${closerUser.tag} (${closerUser.id})\n`;
  }
  if (reason) {
    text += `Reason: ${reason}\n`;
  }
  if (ticketInfo.answers && ticketInfo.answers.length > 0) {
    text += `\n--- Pre-Ticket Form Answers ---\n`;
    ticketInfo.answers.forEach((a) => {
      text += `Q: ${a.question}\nA: ${a.answer}\n\n`;
    });
  }
  text += `\n--- Messages ---\n`;

  for (const msg of messages) {
    const time = new Date(msg.createdAt).toUTCString();
    let contentStr = msg.content;
    if (msg.attachments.size > 0) {
      const atts = msg.attachments.map((a) => a.url).join(", ");
      contentStr += ` [Attachments: ${atts}]`;
    }
    if (msg.embeds.length > 0) {
      contentStr += ` [Embeds: ${msg.embeds.length} present]`;
    }
    text += `[${time}] ${msg.author.tag} (${msg.author.id}): ${contentStr}\n`;
  }
  text += `\n=== End of Transcript ===\n`;

  return new AttachmentBuilder(Buffer.from(text, "utf-8"), { name: `transcript-${channel.name}.txt` });
}

function init(client) {

  setInterval(async () => {
    try {
      const guilds = client.guilds.cache;
      for (const [guildId, guild] of guilds) {
        const config = db.getGuildConfig(guildId);
        if (!config.general || !config.general.autoCloseHours) continue;

        const autoCloseMs = config.general.autoCloseHours * 60 * 60 * 1000;
        const openTickets = (config.activeTickets || []).filter((t) => t.status === "open");

        for (const ticket of openTickets) {
          const channel = guild.channels.cache.get(ticket.channelId);
          if (!channel) {

            db.removeActiveTicket(guildId, ticket.channelId);
            continue;
          }

          let lastMessageTimestamp = ticket.createdAt;
          try {
            const lastMessages = await channel.messages.fetch({ limit: 1 });
            if (lastMessages.size > 0) {
              lastMessageTimestamp = lastMessages.first().createdAt.getTime();
            }
          } catch (e) {
            console.error(`Failed to fetch last message for channel ${channel.id}:`, e.message);
          }

          if (Date.now() - lastMessageTimestamp > autoCloseMs) {

            console.log(`Auto-closing ticket channel ${channel.id} due to inactivity.`);

            db.updateActiveTicket(guildId, ticket.channelId, { status: "closed", lastActivity: Date.now() });

            try {
              await channel.permissionOverwrites.edit(ticket.userId, {
                ViewChannel: false,
              });
            } catch (err) {
              console.error(`Failed to edit permissions for auto-close ticket ${channel.id}:`, err.message);
            }

            try {
              await channel.setName(`closed-inactive-${channel.name.replace("claimed-", "").replace("ticket-", "")}`);
            } catch (err) {
              console.error(`Failed to rename auto-close ticket ${channel.id}:`, err.message);
            }

            let transcriptFile;
            try {
              transcriptFile = await generateTranscript(channel, ticket, client.user, "Inactivity Auto-Close");
            } catch (err) {
              console.error(`Failed to generate transcript for auto-close:`, err.message);
            }

            if (config.general.logsChannel) {
              const logChan = guild.channels.cache.get(config.general.logsChannel);
              if (logChan) {
                const logEmbed = new EmbedBuilder()
                  .setTitle("🔒 Ticket Auto-Closed (Inactivity)")
                  .setDescription(`Ticket channel <#${channel.id}> was automatically closed due to inactivity.`)
                  .setColor("#FF0000")
                  .setTimestamp();

                if (transcriptFile) {
                  await logChan.send({ embeds: [logEmbed], files: [transcriptFile] });
                } else {
                  await logChan.send({ embeds: [logEmbed] });
                }
              }
            }

            const closedEmbed = new EmbedBuilder()
              .setTitle("🔒 Ticket Auto-Closed")
              .setDescription("This ticket has been closed automatically due to inactivity.")
              .setColor("#95A5A6")
              .setTimestamp();

            const deleteBtn = new ButtonBuilder()
              .setCustomId("ticket:delete")
              .setLabel("🗑️ Delete Ticket")
              .setStyle(ButtonStyle.Danger);

            const exportBtn = new ButtonBuilder()
              .setCustomId("ticket:export_transcript")
              .setLabel("📜 Export Transcript")
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(deleteBtn, exportBtn);

            try {
              await channel.send({ embeds: [closedEmbed], components: [row] });
            } catch (err) {
              console.error(`Failed to send auto-close message in channel ${channel.id}:`, err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in auto-close loop:", error);
    }
  }, 5 * 60 * 1000);
}

module.exports = {
  data,
  execute,
  componentHandlers,
  modalHandlers,
  init,
};
