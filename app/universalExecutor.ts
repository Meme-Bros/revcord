import { Client as DiscordClient, TextChannel } from "discord.js";
import npmlog from "npmlog";
import { Client as RevoltClient, Channel, Message as RevoltMessage } from "revolt.js";
import { initiateDiscordChannel, unregisterDiscordChannel } from "./discord";
import { InsufficientPermissionsError } from "./errors";
import { ConnectionPair, Mapping } from "./interfaces";
import { Main } from "./Main";
import { MappingModel } from "./models/Mapping";
import { sendDiscordMessage } from "./revolt";

export class ConnectionError extends Error { }

export class EntityNotFoundError extends Error { }

export type Platforms = "discord" | "revolt";

// I've commited chuunibyou with this name
export default class UniversalExecutor {
  private discord: DiscordClient;
  private revolt: RevoltClient;

  constructor(discord: DiscordClient, revolt: RevoltClient) {
    this.discord = discord;
    this.revolt = revolt;
  }

  /**
   * Create a new bridge
   * @param discordTarget Discord channel name or id
   * @param revoltTarget Revolt channel name or id
   */
  async connect(discordTarget: string, revoltTarget: string) {
    let discordChannelName;
    let revoltChannelName;

    let revoltChannel = this.revolt.channels.get(revoltTarget);

    if (typeof revoltChannel === "undefined") {
      // Revolt channel name was provided.

      // Loop over channels
      let target: Channel;
      this.revolt.channels.forEach((channel) => {
        if (channel.name.toLowerCase() === revoltTarget.toLowerCase()) {
          target = channel;
        }
      });

      if (!target) throw new ConnectionError("Revolt channel not found.");
      else {
        revoltTarget = target.id;
        revoltChannelName = target.name;
      }
    } else {
      // Revolt channel ID was provided - we're just grabbing the name.
      revoltChannelName = revoltChannel.name;
    }

    let discordChannel: TextChannel;

    try {
      // A correct Discord channel ID was provided
      let chan = await this.discord.channels.fetch(discordTarget);
      if (chan instanceof TextChannel) {
        discordChannel = chan;
        discordChannelName = chan.name;
      } else {
        throw new ConnectionError("We're in a weird position.");
      }
    } catch (e) {
      // A Discord channel name was provided

      let channel = this.discord.channels.cache.find((channel) => {
        if (channel instanceof TextChannel) {
          return channel.name.toLowerCase() === discordTarget.toLowerCase();
        }
        return false;
      });

      if (!channel) {
        throw new ConnectionError("Discord channel not found.");
      } else {
        // Must be TextChannel, because checks were performed earlier.
        discordChannel = channel as TextChannel;

        discordTarget = discordChannel.id;
        discordChannelName = discordChannel.name;
      }
    }

    // Save mapping
    await MappingModel.create({
      discordGuild: discordChannel.guildId,
      discordChannel: discordTarget,
      revoltServer: revoltChannel.serverId,
      revoltChannel: revoltTarget,
      discordChannelName,
      revoltChannelName,
    });

    const mapping: Mapping = {
      discord: discordTarget,
      revolt: revoltTarget,
    };

    Main.mappings.push(mapping);

    // Initialize webhook
    await initiateDiscordChannel(discordChannel, mapping);
  }

  /**
   * Disconnect a bridge
   * @param source Source platform
   * @param channelId Channel ID
   */
  async disconnect(source: "discord" | "revolt", channelId: string) {
    let mapping: Mapping;

    if (source === "discord") {
      mapping = Main.mappings.find((mapping) => mapping.discord === channelId);
    } else {
      mapping = Main.mappings.find((mapping) => mapping.revolt === channelId);
    }

    if (!mapping) {
      throw new ConnectionError("This channel is not connected to anything.");
    }

    // Get Discord channel
    const discordChannel = await this.discord.channels.fetch(mapping.discord);

    if (!discordChannel) {
      throw new ConnectionError("Discord channel not found.");
    }

    // Remove webhook
    await unregisterDiscordChannel(discordChannel, mapping);

    // Remove mapping from database
    await MappingModel.destroy({
      where: {
        discordChannel: mapping.discord,
        revoltChannel: mapping.revolt,
      },
    });

    // Remove mapping from memory
    const i = Main.mappings.indexOf(mapping);
    Main.mappings.splice(i, 1);
  }

  /**
   * Return all existing connections
   */
  async connections(): Promise<ConnectionPair[]> {
    const mappings = await MappingModel.findAll();

    const channelPairs = mappings.map((mapping) => ({
      discord: mapping.discordChannelName,
      revolt: mapping.revoltChannelName,
      allowBots: mapping.allowBots,
    }));

    return channelPairs;
  }

  /**
   * Toggle whether bot messages should be forwarded between a channel pair
   */
  async toggleAllowBots(target: Mapping): Promise<boolean> {
    const index = Main.mappings.indexOf(target);

    if (index > -1) {
      // Update locally
      Main.mappings[index].allowBots = !Main.mappings[index].allowBots;

      const allowBots = Main.mappings[index].allowBots;

      // Update the database
      const affectedRows = await MappingModel.update(
        {
          allowBots,
        },
        {
          where: {
            discordChannel: target.discord,
            revoltChannel: target.revolt,
          },
        }
      );

      if (affectedRows[0] === 0) {
        npmlog.error("db", "No affected rows?");
        throw new ConnectionError("No connection found.");
      }

      return allowBots;
    } else {
      throw new ConnectionError("This channel is not connected.");
    }
  }

  /**
   * Pings a Discord user
   */
  async pingDiscordUser(revoltMessage: RevoltMessage, username: string): Promise<string> {
    const target = Main.mappings.find(
      (mapping) => mapping.revolt === revoltMessage.channelId
    );

    if (target) {
      // Find target channel
      const channel = await this.discord.channels.fetch(target.discord);

      if (channel instanceof TextChannel) {
        // Find user
        const query = username.toLowerCase();

        const user = this.discord.users.cache.find(
          (user) =>
            user.username.toLowerCase() === query ||
            user.username.toLowerCase() + "#" + user.discriminator === query
        );

        if (user) {
          // Find webhook
          const webhook = Main.webhooks.find(
            (webhook) => webhook.name === "revcord-" + target.revolt
          );

          if (!webhook) {
            throw new Error("No webhook");
          }

          // Send message
          const avatarURL = revoltMessage.author.avatarURL;

          await sendDiscordMessage(
            webhook,
            {
              messageId: revoltMessage.id,
              authorId: revoltMessage.authorId,
              channelId: revoltMessage.channelId,
            },
            `<@${user.id}>`,
            revoltMessage.author.username,
            avatarURL,
            null,
            true
          );

          return user.username + "#" + user.discriminator;
        } else {
          throw new EntityNotFoundError("User not found.");
        }
      }
    } else {
      throw new EntityNotFoundError("This channel is not connected.");
    }
  }

  static async initializeWebhook(channel: TextChannel, revoltChannelId: string) {
    const mapping: Mapping = {
      discord: channel.id,
      revolt: revoltChannelId,
    };
    await initiateDiscordChannel(channel, mapping);
  }
}
