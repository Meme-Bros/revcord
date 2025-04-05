import {
  Channel,
  Client as DiscordClient,
  Collection,
  Message,
  MessageMentions,
  TextChannel,
  Attachment,
} from "discord.js";
import {
  DataCreateChannel
} from "revolt-api/esm/types";
import npmlog from "npmlog";
import { Client as RevoltClient } from "revolt.js";
import { Main } from "./Main";
import { Mapping, PartialDiscordMessage, ReplyObject } from "./interfaces";
import {
  DiscordChannelPattern,
  DiscordEmojiPattern,
  DiscordPingPattern,
  TrailingNewlines,
} from "./util/regex";
import { RevcordEmbed } from "./util/embeds";
import { checkWebhookPermissions } from "./util/permissions";
import { truncate } from "./util/truncate";
import { MappingModel } from "./models/Mapping";
import UniversalExecutor from "./universalExecutor";

/**
 * This file contains code taking care of things from Discord to Revolt
 * Discord => Revolt
 */

/**
 * Format a Discord message with all attachments to Revolt-friendly format
 * @param attachments message.attachments
 * @param content message.content
 * @param ping ID of the user to ping
 * @returns Formatted string
 */
export function formatMessage(
  attachments: Collection<string, Attachment>,
  content: string,
  mentions: MessageMentions,
  stickerUrl?: string
) {
  let messageString = "";

  // Handle emojis
  const emojis = content.match(DiscordEmojiPattern);
  if (emojis) {
    emojis.forEach((emoji, i) => {
      const dissected = DiscordEmojiPattern.exec(emoji);

      // reset internal pointer... what is that even
      DiscordEmojiPattern.lastIndex = 0;

      if (dissected !== null) {
        const emojiName = dissected.groups["name"];
        const emojiId = dissected.groups["id"];

        if (emojiName && emojiId) {
          let emojiUrl: string;

          // Limit displayed emojis to 5 to reduce spam
          if (i < 5) {
            emojiUrl =
              "https://cdn.discordapp.com/emojis/" +
              emojiId +
              ".webp?size=32&quality=lossless";
          }
          content = content.replace(emoji, `[:${emojiName}:](${emojiUrl})`);
        }
      }
    });
  }

  // Handle pings
  const pings = content.match(DiscordPingPattern);
  if (pings) {
    for (const ping of pings) {
      const matched = DiscordPingPattern.exec(ping);
      // reset internal pointer because i'm too lazy to figure out however it works
      DiscordPingPattern.lastIndex = 0;

      // Extract the mentioned member's ID from ping string
      if (matched !== null) {
        const id = matched.groups["id"];

        if (id) {
          // Find the member among mentions by ID
          const match = mentions.members.find((member) => member.id === id);

          // Why? Because if a user is mentioned twice,
          // mentions collection contains only the first mention.

          if (match) {
            content = content.replace(
              ping,
              `[@${match.user.username}#${match.user.discriminator}]()`
            );
          }
        }
      }
    }
  }

  // Handle channel mentions
  const channelMentions = content.match(DiscordChannelPattern);
  if (channelMentions) {
    for (const [index, mention] of channelMentions.entries()) {
      const match = mentions.channels.at(index);

      if (match && match instanceof TextChannel) {
        content = content.replace(mention, "#" + match.name);
      }
    }
  }

  messageString += content + "\n";

  attachments.forEach((attachment) => {
    messageString += attachment.url + "\n";
  });

  if (stickerUrl) messageString += stickerUrl + "\n";

  messageString = messageString.replace(TrailingNewlines, '');

  return messageString;
}

export function transformDiscordChannelNameToRevolt(channelName: string): string
{
  return truncate(channelName, 32);
}

/**
 * Handle Discord channel delete in Revolt by unlinking (if linked)
 * @param revolt Revolt client
 * @param discord Discord client
 * @param channel Discord text channel
 */
export async function handleDiscordChannelDelete(
  revolt: RevoltClient,
  discord: DiscordClient,
  channel: TextChannel
) {
  const universalExecutor = new UniversalExecutor(discord, revolt);
  const channelId = channel.id;

  // Grab a random channel mapping item that already has this guild linked
  const discordGuildMapping = await MappingModel.findOne({
    where: {
      discordChannel: channelId
    }
  });

  if (! discordGuildMapping) {
    console.error(`Attempted to automatically unlink deleted channel, but Discord channel ID "${channelId}" is unknown, so it's probably not connected to anything.`);

    return;
  }

  await MappingModel.destroy({
    where: {
      discordChannel: channelId
    }
  });

  console.log(`Automatically disconnected Discord channel "${channel.id}" from Revolt channel "${discordGuildMapping.revoltChannel}"`);
}

/**
 * Initialize webhook in a Discord channel
 * @param channel A Discord channel
 * @param mapping A mapping pair
 * @throws
 */
export async function initiateDiscordChannel(channel: Channel, mapping: Mapping) {
  if (channel instanceof TextChannel) {
    await checkWebhookPermissions(channel);

    const webhooks = await channel.fetchWebhooks();

    // Try to find already created webhook
    let webhook = webhooks.find((wh) => wh.name === "revcord-" + mapping.revolt);

    if (!webhook) {
      npmlog.info("Discord", "Creating webhook for Discord#" + channel.name);

      // No webhook found, create one
      webhook = await channel.createWebhook({ name: `revcord-${mapping.revolt}` });
    }

    Main.webhooks.push(webhook);
  }
}

/**
 * Unregister a Discord channel (when disconnecting)
 */
export async function unregisterDiscordChannel(channel: Channel, mapping: Mapping) {
  if (channel instanceof TextChannel) {
    await checkWebhookPermissions(channel);

    const webhooks = await channel.fetchWebhooks();

    // Try to find created webhooks
    let webhook = webhooks.find((wh) => wh.name === "revcord-" + mapping.revolt);

    npmlog.info("Discord", "Removing webhook for Discord#" + channel.name);

    // Remove the webhook
    if (webhook) {
      await webhook.delete();

      // Remove from memory
      const i = Main.webhooks.indexOf(webhook);
      Main.webhooks.splice(i, 1);
    }
  }
}
