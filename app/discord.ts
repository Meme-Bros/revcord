import {
  Channel,
  Collection,
  MessageMentions,
  TextChannel,
  Attachment,
} from "discord.js";
import npmlog from "npmlog";
import { Main } from "./Main";
import { Mapping } from "./interfaces";
import {
  DiscordChannelPattern,
  DiscordEmojiPattern,
  DiscordPingPattern,
  TrailingNewlines,
} from "./util/regex";
import { Client as RevoltClient } from "revolt.js";
import { checkWebhookPermissions } from "./util/permissions";
import { truncate } from "./util/truncate";

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
export async function formatMessage(
  attachments: Collection<string, Attachment>,
  content: string,
  mentions: MessageMentions,
  stickerUrl?: string,
  revoltClient?: RevoltClient,
) {
  let messageString = "";
  let messageAttachments: string[] = [];

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

  if (attachments.size > 0) {
    npmlog.info("Discord", "Processing attachments Discord -> Revolt");
    messageAttachments = await Promise.all(attachments.map(async (attachment) => {
      try {
        const blob = await (await fetch(attachment.url)).blob();

        const formData = new FormData();
        formData.append('file', blob, attachment.name);

        const uploadResponse = await fetch(`${process.env.REVOLT_ATTACHMENT_URL || "https://api.revolt.chat"}/attachments`, {
          method: 'POST',
          headers: {
            'X-Bot-Token': process.env.REVOLT_TOKEN
          },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}`);
        }

        return (await uploadResponse.json() as { id: string }).id;

      } catch (error) {
        npmlog.error("Discord", `Error processing attachment ${attachment.name}: ${error}`);
        return "";
      }
    }));
  }

  if (stickerUrl) messageString += stickerUrl + "\n";

  messageString = content + "\n" + messageString;
  messageString = messageString.replace(TrailingNewlines, '');

  return { messageString, messageAttachments };
}

export function transformDiscordChannelNameToRevolt(channelName: string): string {
  return truncate(channelName, 32);
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
