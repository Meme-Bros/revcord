import { Client as DiscordClient, Collection, GatewayIntentBits, ChannelType, Channel, TextChannel } from "discord.js";
import { Client as RevoltClient } from "revolt.js";
import { REST } from "@discordjs/rest";
import npmlog from "npmlog";

import { Main } from "./Main";
import {
  handleDiscordChannelCreate,
  handleDiscordChannelDelete,
  handleDiscordMessageDelete,
  handleDiscordMessageUpdate,
  initiateDiscordChannel,
} from "./discord";
import {
  handleRevoltMessageDelete,
  handleRevoltMessageUpdate,
} from "./revolt";
import { registerSlashCommands } from "./discord/slash";
import { DiscordCommand, PartialDiscordMessage, RevoltCommand } from "./interfaces";
import { slashCommands } from "./discord/commands";
import UniversalExecutor from "./universalExecutor";
import { revoltCommands } from "./revolt/commands";
import MessageCreateEvent from "./events/MessageCreateEvent";
import type IBotEvent from "./events/IBotEvent";

export class Bot {
  private discord: DiscordClient;
  private revolt: RevoltClient;
  private commands: Collection<string, DiscordCommand>;
  private rest: REST;
  private commandsJson: any;
  // ah yes, using discord.js collections for revolt commands
  private revoltCommands: Collection<string, RevoltCommand>;
  private executor: UniversalExecutor;

  private botEvents: Array<IBotEvent> = [
    new MessageCreateEvent()
  ];

  public async start() {
    this.setupDiscordBot();
    this.setupRevoltBot();
  }

  setupDiscordBot() {
    this.discord = new DiscordClient({
      // I must have GuildMessages to make it working again, thank you discord.js!
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
      ],
      allowedMentions: {
        parse: [],
      },
    });

    this.discord.once("ready", () => {
      npmlog.info(
        "Discord",
        `Logged in as ${this.discord.user.username}#${this.discord.user.discriminator}`
      );

      // Register slash commands
      this.rest = new REST().setToken(process.env.DISCORD_TOKEN);

      this.executor = new UniversalExecutor(this.discord, this.revolt);

      // Initialize slash commands collection
      this.commands = new Collection();

      // Insert exported slash commands into the collection
      slashCommands.map((command) => {
        this.commands.set(command.data.name, command);
      });

      // Convert commands into REST-friendly format
      this.commandsJson = this.commands.map((command) => command.data.toJSON());

      // Register commands for each guild
      this.discord.guilds.cache.forEach((guild) => {
        registerSlashCommands(this.rest, this.discord, guild.id, this.commandsJson);
      });

      // Create webhooks
      Main.mappings.forEach(async (mapping) => {
        const channel = this.discord.channels.cache.get(mapping.discord);
        try {
          await initiateDiscordChannel(channel, mapping);
        } catch (e) {
          npmlog.error("Discord", "An error occurred while initializing webhooks");
          npmlog.error("Discord", e);
        }
      });
    });

    this.discord.on("interactionCreate", async (interaction) => {
      if (! interaction.isCommand()) return;

      const command = this.commands.get(interaction.commandName);

      if (!command) {
        npmlog.info("Discord", "no command");
        return;
      }

      try {
        await command.execute(interaction, this.executor);
      } catch (e) {
        npmlog.error("Discord", "Error while executing slash command");
        npmlog.error("Discord", e);
      }
    });

    this.discord.on("guildCreate", (guild) => {
      // Register slash commands in newly added server
      registerSlashCommands(this.rest, this.discord, guild.id, this.commandsJson);
    });

    this.discord.on("channelCreate", async (channel: TextChannel) => {
      if (channel.type !== ChannelType.GuildText) {
        console.log(`Discord channel "${channel.name}" was created, but it's not a text channel. Ignoring`);

        return;
      }

      handleDiscordChannelCreate(this.revolt, this.discord, channel);
    });

    this.discord.on("channelDelete", async (channel: TextChannel) => {
      if (channel.type !== ChannelType.GuildText) {
        console.log(`Discord channel "${channel.name}" was deleted, but it's not a text channel. Ignoring`);

        return;
      }

      handleDiscordChannelDelete(this.revolt, this.discord, channel);
    });

    // Debugging
    if (process.env.DEBUG && !isNaN(Number(process.env.DEBUG))) {
      if (Number(process.env.DEBUG)) {
        this.discord.on("debug", (info) => {
          if (info.toLowerCase().includes("heartbeat")) return;
          npmlog.info("DEBUG", info);
        });
      }
    }

    this.discord.on("messageUpdate", (oldMessage, newMessage) => {
      if (oldMessage.applicationId === this.discord.user.id) return;

      const partialMessage: PartialDiscordMessage = {
        author: oldMessage.author,
        attachments: oldMessage.attachments,
        channelId: oldMessage.channelId,
        content: newMessage.content,
        embeds: newMessage.embeds,
        id: newMessage.id,
        mentions: newMessage.mentions,
      };

      handleDiscordMessageUpdate(this.revolt, partialMessage);
    });

    this.discord.on("messageDelete", (message) => {
      if (message.applicationId === this.discord.user.id) return;

      handleDiscordMessageDelete(this.revolt, message.id);
    });

    for (const botEvent of this.botEvents) {
      if (! botEvent.DISCORD_EVENT) {
        // This event doesn't have a discord equivalent

        continue;
      }

      console.log(`Registering event "${botEvent.DISCORD_EVENT}" (Discord -> Revolt)`);
      this.discord.on(botEvent.DISCORD_EVENT, async (event) => await botEvent.discordToRevolt(this.revolt, this.discord, event));
    }

    this.discord.login(process.env.DISCORD_TOKEN);
  }

  setupRevoltBot() {
    this.revolt = new RevoltClient({ apiURL: process.env.API_URL, autoReconnect: true });

    this.revolt.once("ready", () => {
      npmlog.info("Revolt", `Logged in as ${this.revolt.user.username}`);

      // Initialize revolt commands
      this.revoltCommands = new Collection();

      // Insert exported Revolt commands into the collection
      revoltCommands.map((command) => {
        this.revoltCommands.set(command.data.name, command);
      });

      // TODO add permissions self-check
      Main.mappings.forEach(async (mapping) => {
        const channel = this.revolt.channels.get(mapping.revolt);
        try {
          if (channel) {
          }
        } catch (e) {
          npmlog.error("Revolt", e);
        }
      });
    });

    this.revolt.on("message/update", async (message) => {
      if (message.author.bot !== null) return;

      if (typeof message.content != "string") return;

      handleRevoltMessageUpdate(this.revolt, message);
    });

    this.revolt.on("message/delete", async (id) => {
      handleRevoltMessageDelete(this.revolt, id);
    });

    for (const botEvent of this.botEvents) {
      if (! botEvent.REVOLT_EVENT) {
        // This event doesn't have a revolt equivalent

        continue;
      }

      console.log(`Registering event "${botEvent.REVOLT_EVENT}" (Revolt -> Discord)`);

      // @ts-ignore: 2769
      this.revolt.on(botEvent.REVOLT_EVENT, async (event) => await botEvent.revoltToDiscord(this.revolt, this.discord, event));
    }

    this.revolt.loginBot(process.env.REVOLT_TOKEN);
  }
}
