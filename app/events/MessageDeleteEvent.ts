import {
    Client as RevoltClient,
} from "revolt.js";
import {
    Client as DiscordClient,
    Message as DiscordMessage,
} from "discord.js";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { Main } from "../Main";


export default class MessageDeleteEvent implements IBotEvent
{
    public DISCORD_EVENT = 'messageDelete';
    public REVOLT_EVENT = 'message/delete';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, messageId: string, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        const cachedMessage = Main.revoltCache.find(
            (cached) => cached.parentMessage === messageId
        );

        if (! cachedMessage) {
            // We don't know this message (anymore), ignore

            return;
        }

        try {
            const target = Main.mappings.find(
                (mapping) => mapping.revolt === cachedMessage.channelId
            );
        
            if (! target) {
                // Should never happen, but might as well fail safely if it does

                return;
            }

            const webhook = Main.webhooks.find(
                (webhook) => webhook.name === "revcord-" + target.revolt
            );

            if (! webhook) {
                // Should never happen, but might as well fail safely if it does

                return;
            }

            await webhook.deleteMessage(cachedMessage.createdMessage);

            // TODO remove from cache
        } catch (e) {
            npmlog.error("Discord", "Failed to delete message");
            npmlog.error("Discord", e);
        }
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, message: DiscordMessage, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        // Warning: Most of the message object will not be available, ID should be safe though

        const cachedMessage = Main.discordCache.find(
            (cached) => cached.parentMessage === message.id
        );

        if (! cachedMessage) {
            // We don't know this message (anymore), ignore

            return;
        }

        if (message.applicationId === discord.user.id) {
            // We (the bot) send this message, ignore

            return;
        }

        try {
            const target = Main.mappings.find(
                (mapping) => mapping.discord === cachedMessage.channelId
            );
        
            if (! target) {
                // Should never happen, but might as well fail safely if it does

                return;
            }

            const channel = await revolt.channels.get(target.revolt);
            const messageToDelete = await channel.fetchMessage(cachedMessage.createdMessage);

            await messageToDelete.delete();

            // TODO remove from cache
        } catch (e) {
            npmlog.error("Revolt", "Failed to delete message");
            npmlog.error("Revolt", e);
        }
    }
}
