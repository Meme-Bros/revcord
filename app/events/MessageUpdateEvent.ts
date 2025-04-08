import {
    Client as RevoltClient,
    Message as RevoltMessage
} from "revolt.js";
import {
    Client as DiscordClient,
    Message as DiscordMessage,
} from "discord.js";
import {
    formatMessage as formatMessageForDiscord
} from "../revolt";
import {
    formatMessage as formatMessageForRevolt
} from "../discord";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { Main } from "../Main";
import { PartialDiscordMessage } from "../interfaces";
import { RevcordEmbed } from "../util/embeds";


export default class MessageUpdateEvent implements IBotEvent {
    public DISCORD_EVENT = 'messageUpdate';
    public REVOLT_EVENT = 'messageUpdate';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, message: RevoltMessage, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        if (message.author.bot !== null) {
            // Not sure why this check exists, but it was already here, so we keep it :)

            return;
        }

        if (typeof message.content != "string") {
            return;
        }

        const target = Main.mappings.find(
            (mapping) => mapping.revolt === message.channelId
        );

        if (!target) {
            // This channel isn't connected, ignore

            return;
        }

        try {
            const cachedMessage = Main.revoltCache.find(
                (cached) => cached.parentMessage === message.id
            );

            if (!cachedMessage) {
                // We don't know this message (anymore), ignore

                return;
            }

            const webhook = Main.webhooks.find(
                (webhook) => webhook.name === "revcord-" + target.revolt
            );

            if (!webhook) {
                // Should never happen, but might as well fail safely if it does

                return;
            }

            const messageString = await formatMessageForDiscord(revolt, message);

            await webhook.editMessage(cachedMessage.createdMessage, {
                content: messageString,
            });
        } catch (e) {
            npmlog.error("Discord", "Failed to edit message");
            npmlog.error("Discord", e);
        }
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, oldMessage: DiscordMessage, newMessage: DiscordMessage, eventParameterThree: undefined): Promise<void> {
        if (oldMessage.applicationId === discord.user.id) {
            // We (the bot) send this message, ignore

            return;
        }

        const partialMessage: PartialDiscordMessage = {
            author: oldMessage.author,
            attachments: oldMessage.attachments,
            channelId: oldMessage.channelId,
            content: newMessage.content,
            embeds: newMessage.embeds,
            id: newMessage.id,
            mentions: newMessage.mentions,
        };

        const target = Main.mappings.find(
            (mapping) => mapping.discord === partialMessage.channelId
        );

        try {
            if (!target) {
                // We don't have this channel mapped to anything, ignore

                return;
            }

            if (partialMessage.author.bot && !target.allowBots) {
                // Message from a bot while we don't allow bot users, ignore

                return;
            }

            const cachedMessage = Main.discordCache.find(
                (cached) => cached.parentMessage === partialMessage.id
            );

            if (!cachedMessage) {
                // This message is unknown to use, ignore

                return;
            }

            const messageObject = {} as any;

            if (partialMessage.content.length > 0) {
                messageObject.content = formatMessageForRevolt(
                    partialMessage.attachments,
                    partialMessage.content,
                    partialMessage.mentions
                );
            }

            if (partialMessage.embeds.length && partialMessage.author.bot) {
                if (typeof messageObject.embeds === "undefined") messageObject.embeds = [];

                try {
                    const embed = new RevcordEmbed().toRevolt();

                    messageObject.embeds.push(embed);
                } catch (e) {
                    npmlog.warn("Discord", "Failed to translate embed.");
                    npmlog.warn("Discord", JSON.stringify(partialMessage.embeds[0]));
                    npmlog.warn("Discord", e);
                }
            }

            const channel = await revolt.channels.get(target.revolt);
            const messageToEdit = await channel.fetchMessage(cachedMessage.createdMessage);

            await messageToEdit.edit(messageObject);
        } catch (e) {
            npmlog.error("Revolt", "Failed to edit message");
            npmlog.error("Discord", e);
        }
    }
}
