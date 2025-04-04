import {
    Client as RevoltClient,
    Message as RevoltMessage
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel,
    EmbedBuilder,
    Message as DiscordMessage,
    Collection
} from "discord.js";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { Main } from "../Main";
import {
    ReplyObject,
    AttachmentType,
    RevoltCommand
} from "../interfaces";
import {
    sendDiscordMessage,
    formatMessage as formatMessageForDiscord
} from "../revolt";
import { revoltCommands } from "../revolt/commands";
import UniversalExecutor from "../universalExecutor";
import {
    formatMessage as formatMessageForRevolt
} from "../discord";
import { truncate } from "../util/truncate";
import { RevcordEmbed } from "../util/embeds";


export default class MessageCreateEvent implements IBotEvent
{
    public DISCORD_EVENT = 'messageCreate';
    public REVOLT_EVENT = 'message';

    private revoltCommands: Collection<string, RevoltCommand>;

    constructor() {
        // Initialize revolt commands
        this.revoltCommands = new Collection();

        // Insert exported Revolt commands into the collection
        revoltCommands.map((command) => {
            this.revoltCommands.set(command.data.name, command);
        });
    }

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, message: RevoltMessage): Promise<void> {
        if (typeof message.content !== "string") return;

        const target = Main.mappings.find(
            (mapping) => mapping.revolt === message.channel_id
        );

        if (! target) {
            // We don't have this channel mapped to anything, ignore

            return;
        }

        if (message.author_id === message.client.user._id) {
            // We (the bot) send this message, ignore

            return;
        }

        if (message.author.bot && ! target.allowBots) {
            // Message from a bot while we don't allow bot users, ignore

            return;
        }

        if (message.content.toString().startsWith("rc!")) {
            // Handle bot command
            const args = message.content.toString().split(" ");
            const commandName = args[0].slice("rc!".length);
            args.shift();
            const arg = args.join(" ");

            if (! this.revoltCommands) return;

            const command = this.revoltCommands.get(commandName);

            if (! command) {
                npmlog.info("Revolt", "no command");
                return;
            }

            try {
                const executor = new UniversalExecutor(discord, revolt);

                await command.execute(message, arg, executor);
            } catch (e) {
                npmlog.error("Revolt", "Error while executing command");
                npmlog.error("Revolt", e);
            }
        }

        const channel = await discord.channels.fetch(target.discord);

        if (! (channel instanceof TextChannel)) {
            // We only care about text channels, ignore

            return;
        }

        const webhook = Main.webhooks.find((webhook) => webhook.name === `revcord-${target.revolt}`);
    
        if (! webhook) {
            throw new Error(`No webhook in channel Discord#${channel.name}`);
        }

        // Handle replies
        const reply_ids = message.reply_ids;
        let reply: ReplyObject;
        
        if (reply_ids) {
            const crossPlatformReference = Main.discordCache.find((cached) => cached.createdMessage === reply_ids[0]);
        
            if (crossPlatformReference) {
                // Find Discord message that's being replied to
                const referencedMessage = await channel.messages.fetch(crossPlatformReference.parentMessage);
        
                // Parse attachments
                let attachments: AttachmentType[] = [];
        
                if (referencedMessage.attachments.first()) {
                    attachments.push("file");
                }
        
                if (referencedMessage.embeds.length > 0) {
                    attachments.push("embed");
                }
        
                const replyObject: ReplyObject = {
                    pingable: false,
                    entity: `${referencedMessage.author.username}#${referencedMessage.author.discriminator}`,
                    entityImage: referencedMessage.author.avatarURL(),
                    content: referencedMessage.content,
                    originalUrl: referencedMessage.url,
                    attachments: attachments ? attachments : [],
                };

                reply = replyObject;
            } else {
                try {
                    const channel = revolt.channels.get(target.revolt);
                    const message = await channel.fetchMessage(reply_ids[0]);
        
                    // Parse attachments
                    let attachments: AttachmentType[] = [];
        
                    if (message.attachments !== null) {
                        attachments.push("file");
                    }
        
                    const replyObject: ReplyObject = {
                        pingable: false,
                        entity: message.author.username,
                        entityImage: message.author.generateAvatarURL({ size: 64 }),
                        content: message.content.toString(),
                        attachments: attachments ? attachments : [],
                    };
        
                    reply = replyObject;
                } catch {}
            }
        }

        const messageString = await formatMessageForDiscord(revolt, message);

        let embed: EmbedBuilder|null = null;

        if (reply) {
            embed = new EmbedBuilder()
                .setColor("#5875e8")
                .setAuthor({ name: reply.entity, iconURL: reply.entityImage });

            // Add original message URL and content
            if (reply.content) {
                if (reply.originalUrl) {
                    embed.setDescription(`[**Reply to:**](${reply.originalUrl}) ` + reply.content);
                } else {
                    embed.setDescription(`**Reply to**: ` + reply.content);
                }
            } else if (reply.originalUrl) {
                embed.setDescription(`[**Reply to**](${reply.originalUrl})`);
            }

            // Add attachments field
            if (reply.attachments.length > 0) {
                embed.setFooter({
                    text: "contains " + reply.attachments.map((a) => a + " "),
                });
            }
        }

        const avatarURL = message.author.generateAvatarURL({}, true);

        await sendDiscordMessage(
            webhook,
            {
                messageId: message._id,
                authorId: message.author_id,
                channelId: message.channel_id,
            },
            messageString,
            message.author.username,
            avatarURL,
            embed,
            false
        );
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, message: DiscordMessage): Promise<void> {
        const target = Main.mappings.find(
            (mapping) => mapping.discord === message.channelId
        );

        if (! target) {
            // We don't have this channel mapped to anything, ignore

            return;
        }

        if (message.applicationId === discord.user.id) {
            // We (the bot) send this message, ignore

            return;
        }

        if (message.author.bot && ! target.allowBots) {
            // Message from a bot while we don't allow bot users, ignore

            return;
        }

        // Prepare masquerade
        const mask = {
            name: truncate(message.author.username, 32),
            avatar: message.author.avatarURL(),
        };

        // Handle replies
        const reference = message.reference;
        let replyPing: string;

        let replyEmbed: ReplyObject;

        if (reference) {
            // Find cross-platform replies
            const crossPlatformReference = Main.revoltCache.find(
            (cached) => cached.createdMessage === reference.messageId
            );

            if (crossPlatformReference) {
                replyPing = crossPlatformReference.parentMessage;
            } else {
                // Find same-platform replies
                const samePlatformReference = Main.discordCache.find(
                    (cached) => cached.parentMessage === reference.messageId
                );

                if (samePlatformReference) {
                    replyPing = samePlatformReference.createdMessage;
                } else {
                    // Fallback - this happens when someone replies to a message
                    // that was sent before the bot was started

                    // Wrap in another try-catch since it may fail
                    // if the bot doesn't have permission to view message history
                    try {
                        // Fetch referenced message
                        const sourceChannel = await discord.channels.fetch(
                            message.reference.channelId
                        );

                        if (! (sourceChannel instanceof TextChannel)) {
                            // We only care about text channels, ignore

                            return;
                        }

                        const referenced = await sourceChannel.messages.fetch(
                            message.reference.messageId
                        );

                        // Prepare reply embed
                        const formattedContent = formatMessageForRevolt(
                            referenced.attachments,
                            referenced.content,
                            referenced.mentions
                        );

                        replyEmbed = {
                            pingable: false,
                            entity: referenced.author.username,
                            entityImage: referenced.author.avatarURL(),
                            content: formattedContent,
                            attachments: [],
                        };

                        if (referenced.attachments.first()) {
                            replyEmbed.attachments.push("file");
                            replyEmbed.previewAttachment = referenced.attachments.first().url;
                        }
                    } catch (e) {
                        npmlog.warn("Discord", 'Bot lacks the "View message history" permission.');
                        npmlog.warn("Discord", e);
                    }
                }
            }
        }

        // Sticker
        const sticker = message.stickers.first();
        let stickerUrl = sticker && sticker.url;

        // Format message content (parse emojis, mentions, images etc.)
        const messageString = formatMessageForRevolt(
            message.attachments,
            message.content,
            message.mentions,
            stickerUrl
        );

        // Prepare message object
        // revolt.js doesn't support masquerade yet, but we can use them using this messy trick.
        const messageObject = {
            content: truncate(messageString, 1984),
            masquerade: mask,
            replies: replyPing
            ? [
                {
                    id: replyPing,
                    mention: false,
                },
                ]
            : [],
        } as any;

        if (replyEmbed) {
            if (typeof messageObject.embeds === "undefined") {
                messageObject.embeds = [];
            }

            messageObject.embeds.push({
                type: "Text",
                icon_url: replyEmbed.entityImage,
                title: replyEmbed.entity,
                description: `**Reply to**: ${replyEmbed.content}`,
            });
        }

        // Translate embeds, if present.
        // Allow embeds only from bots, since a regular user
        // shouldn't be able to send them.
        if (message.embeds.length && message.author.bot) {
            // Add an empty array
            if (typeof messageObject.embeds === "undefined") {
                messageObject.embeds = [];
            }

            // Translate embed
            try {
                const embed = new RevcordEmbed().fromDiscord(message.embeds[0]).toRevolt();
                
                messageObject.embeds.push(embed);
            } catch (e) {
                npmlog.warn("Discord", "Failed to translate embed.");
                npmlog.warn("Discord", e);
            }
        }

        try {
            const sentMessage = await revolt.channels
                .get(target.revolt)
                .sendMessage(messageObject);

            // Save in cache
            Main.discordCache.push({
                parentMessage: message.id,
                parentAuthor: message.author.id,
                createdMessage: sentMessage._id,
                channelId: target.discord,
            });
        } catch (e) {
            npmlog.warn("Revolt", "Couldn't send a message to Revolt");
            npmlog.warn("Revolt", e);

            if ("response" in e && "status" in e.response && e.response.status === 403) {
                npmlog.error(
                    "Revolt",
                    "It seems the bot doesn't have enough permissions (most likely Masquerade)"
                );
            }
        }
    }
}
