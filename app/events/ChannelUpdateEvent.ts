import {
    Client as RevoltClient,
    Channel as RevoltChannel,
    API,
    Channel
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
    GuildChannelEditOptions,
} from "discord.js";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { transformRevoltChannelNameToDiscord } from "../revolt";
import { transformDiscordChannelNameToRevolt } from "../discord";
import { Main } from "../Main";

export default class ChannelUpdateEvent implements IBotEvent {
    public DISCORD_EVENT = 'channelUpdate';
    public REVOLT_EVENT = 'channel/update';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channel: RevoltChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        if (channel.type !== 'TextChannel' || !('server' in channel)) {
            // We only care about text channels in servers, ignore
            return;
        }

        const target = Main.mappings.find(
            (mapping) => mapping.revolt === channel.id
        );

        if (!target) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const discordChannel = await discord.channels.fetch(target.discord);

        if (!discordChannel) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        if (!(discordChannel instanceof DiscordTextChannel)) {
            // We only care about text channels, ignore
            return;
        }

        const options: GuildChannelEditOptions = {
            name: transformRevoltChannelNameToDiscord(channel.name),
            nsfw: false, // Default to false since nsfw is not available in v7
            topic: undefined, // Default to undefined since description is not available in v7
        };

        try {
            await discordChannel.edit(options);
        } catch (e) {
            npmlog.error("Discord", "Failed to update channel");
            npmlog.error("Discord", e);
        }
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, oldChannel: DiscordTextChannel, newChannel: DiscordTextChannel, eventParameterThree: undefined): Promise<void> {
        const target = Main.mappings.find(
            (mapping) => mapping.discord === newChannel.id
        );

        if (!target) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const revoltChannel = revolt.channels.get(target.revolt);

        if (!revoltChannel || !('server' in revoltChannel)) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const data: API.DataEditChannel = {
            name: transformDiscordChannelNameToRevolt(newChannel.name),
            description: newChannel.topic || undefined,
            nsfw: newChannel.nsfw || false,
        };

        try {
            await revoltChannel.edit(data);
        } catch (e) {
            npmlog.error("Revolt", "Failed to update channel");
            npmlog.error("Revolt", e);
        }
    }
}
