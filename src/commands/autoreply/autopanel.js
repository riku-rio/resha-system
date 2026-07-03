const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const prisma = require("../../config/database");

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
        { name: "Delete", value: "Delete" }
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

  if (action === "Add") {
    await interaction.respond([]);
    return;
  }

  // Edit or Delete — search existing triggers
  const focused = interaction.options.getFocused().toLowerCase();

  const results = await prisma.autoReply.findMany({
    where: {
      triggerMessage: {
        contains: focused,
      },
    },
    take: 25,
  });

  const choices = results.map((r) => ({
    name: r.triggerMessage,
    value: String(r.id),
  }));

  await interaction.respond(choices);
}

// ─── Execute ──────────────────────────────────────────────────────────────────

async function execute(interaction) {
  // 1. Permission check — must be first
  if (!isAdmin(interaction)) {
    await interaction.reply({
      content: "❌ You need the **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const action = interaction.options.getString("action");
  const query = interaction.options.getString("query");

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

  // ── EDIT ───────────────────────────────────────────────────────────────────
  if (action === "Edit") {
    const record = await prisma.autoReply.findUnique({ where: { id: recordId } });

    if (!record) {
      await interaction.reply({
        content: "❌ That auto-reply no longer exists.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`autoreply:edit_modal:${record.id}`)
      .setTitle("Edit Auto-Reply");

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

    modal.addComponents(
      new ActionRowBuilder().addComponents(triggerInput),
      new ActionRowBuilder().addComponents(replyInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────
  if (action === "Delete") {
    const record = await prisma.autoReply.findUnique({ where: { id: recordId } });

    if (!record) {
      await interaction.reply({
        content: "❌ That auto-reply no longer exists.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

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

// ─── Component Handlers (Buttons) ─────────────────────────────────────────────

const componentHandlers = [
  // Delete — Confirm button
  {
    matches(customId) {
      return customId.startsWith("autoreply:delete_confirm:");
    },
    async execute(interaction) {
      // Permission check
      if (!isAdmin(interaction)) {
        await interaction.reply({
          content: "❌ You don't have permission to do that.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const id = parseInt(interaction.customId.split(":")[2], 10);

      try {
        const deleted = await prisma.autoReply.delete({ where: { id } });
        await interaction.update({
          content: `✅ Auto-reply for trigger **\`${deleted.triggerMessage}\`** has been deleted.`,
          components: [],
        });
      } catch {
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

      // Check for duplicate
      const existing = await prisma.autoReply.findUnique({
        where: { triggerMessage },
      });

      if (existing) {
        await interaction.reply({
          content: `❌ A trigger for **\`${triggerMessage}\`** already exists. Use **Edit** to update it.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await prisma.autoReply.create({
        data: { triggerMessage, replyContent },
      });

      await interaction.reply({
        content: `✅ Auto-reply created!\n**Trigger:** \`${triggerMessage}\`\n**Reply:** ${replyContent}`,
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  // Edit modal
  {
    matches(customId) {
      return customId.startsWith("autoreply:edit_modal:");
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

      // Guard against collisions with other records
      const collision = await prisma.autoReply.findFirst({
        where: {
          triggerMessage,
          NOT: { id },
        },
      });

      if (collision) {
        await interaction.reply({
          content: `❌ Another auto-reply already uses the trigger **\`${triggerMessage}\`**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        await prisma.autoReply.update({
          where: { id },
          data: { triggerMessage, replyContent },
        });

        await interaction.reply({
          content: `✅ Auto-reply updated!\n**Trigger:** \`${triggerMessage}\`\n**Reply:** ${replyContent}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch {
        await interaction.reply({
          content: "❌ Could not update the record — it may have been deleted.",
          flags: MessageFlags.Ephemeral,
        });
      }
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
