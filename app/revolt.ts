import { Client as DiscordClient, EmbedBuilder, TextChannel, Webhook } from "discord.js";
import npmlog from "npmlog";
import { Client as RevoltClient } from "revolt.js";
import { Message } from "revolt.js/dist/maps/Messages";
import { AttachmentType, Mapping, ReplyObject, RevoltSourceParams } from "./interfaces";
import { Main } from "./Main";
import {
  RevoltChannelPattern,
  RevoltEmojiPattern,
  RevoltPingPattern,
} from "./util/regex";
import { truncate } from "./util/truncate";

/**
 * This file contains code taking care of things from Revolt to Discord
 * Revolt => Discord
 */

/**
 * Format a Revolt message with all attachments to Discord-friendly format
 * @param revolt Revolt client
 * @param message Revolt message object
 * @param ping ID of the user to ping
 * @returns Formatted string
 */
export async function formatMessage(revolt: RevoltClient, message: Message) {
  let messageString = "";
  let content = message.content.toString();

  // Handle pings
  const pings = content.match(RevoltPingPattern);
  if (pings && message.mentions) {
    for (const ping of pings) {
      const matched = RevoltPingPattern.exec(ping);
      RevoltPingPattern.lastIndex = 0;

      // Extract the mentioned member's ID and look for it in mentions
      if (matched !== null) {
        const id = matched.groups["id"];

        if (id) {
          const match = message.mentions.find((member) => member._id === id);

          if (match) {
            content = content.replace(ping, `@${match.username}`);
          }
        }
      }
    }
  }

  // Handle channel mentions
  const channelMentions = content.match(RevoltChannelPattern);
  if (channelMentions) {
    for (const mention of channelMentions) {
      const channel = RevoltChannelPattern.exec(mention);
      RevoltChannelPattern.lastIndex = 0;

      if (channel !== null) {
        const channelId = channel.groups["id"];
        if (channelId) {
          try {
            const channelData = await revolt.channels.fetch(channelId);
            content = content.replace(mention, "#" + channelData.name);
          } catch {}
        }
      }
    }
  }

  // Handle emojis
  const emojis = content.match(RevoltEmojiPattern);
  if (emojis) {
    emojis.forEach((emoji, i) => {
      const dissected = RevoltEmojiPattern.exec(emoji);

      RevoltEmojiPattern.lastIndex = 0;

      if (dissected != null) {
        const emojiId = dissected.groups["id"];

        if (emojiId) {
          let emojiUrl: string;

          // Limited to 3 to stop bombing with links
          if (i < 3) {
            const REVOLT_ATTACHMENT_URL =
              process.env.REVOLT_ATTACHMENT_URL || "https://autumn.revolt.chat";
            emojiUrl = `${REVOLT_ATTACHMENT_URL}/emojis/${encodeURIComponent(
              emojiId
            )}/?width=32&quality=lossless`;
            content = content.replace(emoji, emojiUrl);
          }
        }
      }
    });
  }

  messageString += content + "\n";

  // Handle attachments
  if (message.attachments !== null) {
    message.attachments.forEach((attachment) => {
      messageString += "[ . ](" + revolt.generateFileURL(attachment) + ")\n";
    });
  }

  return messageString;
}

export function transformRevoltChannelNameToDiscord(channelName: string): string
{
  return truncate(channelName, 100).replaceAll(' ', '-');
}

/**
 * Send a message to Discord
 * @param webhook Discord webhook
 * @param sourceParams Revolt source message params
 * @param content Target message content
 * @param username Username for webhook
 * @param avatarURL Avatar URL for webhook
 * @param embed Embed for webhook
 * @param allowUserPing Whether to allow user pings
 */
export async function sendDiscordMessage(
  webhook: Webhook,
  sourceParams: RevoltSourceParams,
  content: string,
  username: string,
  avatarURL: string,
  embed: EmbedBuilder | null,
  allowUserPing: boolean
) {
  const webhookMessage = await webhook.send({
    content,
    username,
    avatarURL,
    embeds: embed ? [embed] : [],
    allowedMentions: {
      parse: allowUserPing ? ["users"] : [],
    },
  });

  Main.revoltCache.push({
    parentMessage: sourceParams.messageId,
    parentAuthor: sourceParams.authorId,
    channelId: sourceParams.channelId,
    createdMessage: webhookMessage.id,
  });
}
