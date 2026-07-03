# Resha Bot

A scalable, modular **Discord.js v14** bot built with **Node.js** and **npm**. Features dynamic command/event handling and an integrated Auto-Reply system powered by **Prisma** and **SQLite**.

---

## Features

- **Dynamic Command Router** — Automatically loads Slash commands and Prefix commands from dedicated directories.
- **Dynamic Event & Interaction Handlers** — Decoupled handlers for events, modals, and buttons.
- **Unified `/autopanel` Command** — A robust administrative panel to **Add**, **Edit**, and **Delete** auto-replies seamlessly, complete with autocomplete and confirmation flows.
- **Case-Insensitive Auto-Replies** — Automatically intercepts guild messages and matches triggers regardless of casing, using Prisma-backed lookups.

---

## Prerequisites

- [Node.js](https://nodejs.org) v16.11.0 or higher
- [npm](https://www.npmjs.com) (ships with Node.js)

---

## Setup & Installation

### 1. Clone or navigate to the project

```bash
cd resha_system
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` and set at least the following:

| Variable            | Description                                      |
| ------------------- | ------------------------------------------------ |
| `DISCORD_TOKEN`     | Your bot token from the Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID of your bot                       |
| `DISCORD_GUILD_ID`  | (Optional) Guild ID for guild-scoped commands    |
| `PREFIX`            | Prefix for text commands (default: `^`)          |

> `DISCORD_CLIENT_SECRET` is optional and not required for bot operation.

### 4. Database setup

This project uses **Prisma** with **SQLite** (via better-sqlite3). The database file is `dev.db` in the project root (git-ignored).

**For a fresh installation** — create and apply the initial migration:

```bash
npx prisma migrate dev --name init
```

**If you already have migration files** (e.g., after cloning) but the `dev.db` file is missing or was deleted:

```bash
npx prisma migrate deploy
```

This will recreate the SQLite database from the existing migration history.

---

## Project Structure

```
resha_system/
├── .env.example            # Environment variable template
├── .gitignore
├── index.js                # Entry point
├── package.json
├── prisma.config.ts        # Prisma driver adapter config
├── prisma/
│   ├── schema.prisma       # Database schema (AutoReply model)
│   └── migrations/         # Migration history (auto-generated)
├── src/
│   ├── commands/           # Slash command modules (recursive)
│   │   ├── autoreply/
│   │   │   └── autopanel.js
│   │   └── ping.js
│   ├── config/             # Core configuration & bootstrapping
│   │   ├── bootstrap.js    # Client init, command/event loading, slash sync
│   │   ├── database.js     # Prisma client with better-sqlite3 adapter
│   │   └── env.js          # Environment variable loader & validation
│   ├── events/             # Discord event handlers
│   │   ├── interactionCreate.js
│   │   ├── messageCreate.js
│   │   └── ready.js
│   └── prefixCommands/     # Prefix-based text command modules
│       └── ping.js
```

---

## Scripts & Running the Bot

Start the bot with:

```bash
node index.js
```

The bootstrap process will:

1. Validate required environment variables.
2. Recursively load all Slash commands from `src/commands/`.
3. Recursively load all Prefix commands from `src/prefixCommands/`.
4. Register component (button) and modal handlers from each command module.
5. Recursively load Discord event listeners from `src/events/`.
6. Synchronize Slash commands with the Discord API (guild-scoped if `DISCORD_GUILD_ID` is set, otherwise global).
7. Log in to Discord and begin listening.

### Available npm scripts

This project defines no custom npm scripts — use `npx prisma` for database operations and `node index.js` to run the bot.

---

## Database Schema

```prisma
model AutoReply {
  id             Int      @id @default(autoincrement())
  triggerMessage String   @unique
  replyContent   String
  createdAt      DateTime @default(now())
}
```

---

## License

This project is private / unlicensed. See the repository owner for usage terms.
