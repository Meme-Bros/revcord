import {
    Client as RevoltClient,
    Channel as RevoltChannel,
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
    GuildChannelEditOptions,
} from "discord.js";
import {
    DataEditChannel as RevoltDataEditChannel,
} from "revolt-api/esm/types";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { MappingModel } from "../models/Mapping";
import { transformRevoltChannelNameToDiscord } from "../revolt";
import { transformDiscordChannelNameToRevolt } from "../discord";
import { Main } from "../Main";
import { BridgedEventType } from "../bridgedEvents";
import { promisedTimeout } from "../util/promise";


export default class ChannelUpdateEvent implements IBotEvent
{
    public DISCORD_EVENT = 'channelUpdate';
    public REVOLT_EVENT = 'channel/update';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channel: RevoltChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        // TODO: Troubleshoot why the second update of the same channel takes a really long time

        if (channel.channel_type !== 'TextChannel') {
            npmlog.info('Revolt', `Revolt channel "${channel.name}" was updated, but it's not a text channel. Ignoring`);
        
            return;
        }

        const channelId = channel._id;

        const revoltServerMapping = await MappingModel.findOne({
            where: {
                revoltChannel: channelId
            }
        });

        if (! revoltServerMapping) {
            npmlog.info('Revolt', `Attempted to automatically update channel, but Revolt channel ID "${channelId}" is unknown, so it's probably not connected to anything.`);

            return;
        }

        const discordGuildId = revoltServerMapping.discordGuild;
        const discordGuild = await discord.guilds.fetch(discordGuildId);

        if (! discordGuild) {
            npmlog.error('Revolt', `We can't find Discord guild with ID "${discordGuildId}".`);

            return;
        }

        const discordChannelId = revoltServerMapping.discordChannel;
        const discordChannel = await discordGuild.channels.fetch(discordChannelId);

        if (! discordChannel) {
            npmlog.error('Revolt', `We can't find Discord channel with ID "${discordChannelId}".`);

            return;
        }

        // Wait for a bit, as we might be faster than the recentBridgedEvents
        await promisedTimeout(1000);

        const recentBridgedEvent = Main.recentBridgedEvents.findRecentEventForEitherWay(BridgedEventType.CHANNEL_UPDATE, channelId);

        if (recentBridgedEvent) {
            npmlog.warn('Revolt', `We won't update Discord channel "${discordChannel.name}", as we very recently already handled something similar, ignoring as it's probably our own event`);

            return;
        }

        const discordChannelInformation: GuildChannelEditOptions = {
            name: transformRevoltChannelNameToDiscord(channel.name),
            topic: channel.description,
            nsfw: channel.nsfw
        };

        await discordChannel.edit(discordChannelInformation);

        Main.recentBridgedEvents.addRecentEvent(BridgedEventType.CHANNEL_UPDATE, channel._id, discordChannel.id);

        npmlog.info('Revolt', `Automatically updated Discord channel "${revoltServerMapping.discordChannel}" with Revolt channel "${channelId}"`);
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, oldChannel: DiscordTextChannel, newChannel: DiscordTextChannel, eventParameterThree: undefined): Promise<void> {        
        if (oldChannel.type !== DiscordChannelType.GuildText) {
            npmlog.info('Discord', `Discord channel "${oldChannel.name}" was updated, but it's not a text channel. Ignoring`);

            return;
        }

        const channelId = oldChannel.id;

        const discordGuildMapping = await MappingModel.findOne({
            where: {
              discordChannel: channelId
            }
        });

        if (! discordGuildMapping) {
            npmlog.info('Discord', `Attempted to automatically update channel, but Discord channel ID "${channelId}" is unknown, so it's probably not connected to anything.`);

            return;
        }

        const revoltChannelId = discordGuildMapping.revoltChannel;
        const revoltChannel = await revolt.channels.fetch(revoltChannelId);

        if (! revoltChannel) {
            npmlog.error('Discord', `We can't find Revolt channel with ID "${revoltChannelId}".`);

            return;
        }

        // Wait for a bit, as we might be faster than the recentBridgedEvents
        await promisedTimeout(1000);

        const recentBridgedEvent = Main.recentBridgedEvents.findRecentEventForEitherWay(BridgedEventType.CHANNEL_UPDATE, channelId);

        if (recentBridgedEvent) {
            npmlog.warn('Discord', `We won't update Revolt channel "${revoltChannel.name}", as we very recently already handled something similar, ignoring as it's probably our own event`);

            return;
        }

        const revoltChannelInformation: RevoltDataEditChannel = {
            name: transformDiscordChannelNameToRevolt(newChannel.name),
            description: newChannel.topic,
            nsfw: newChannel.nsfw
        }

        await revoltChannel.edit(revoltChannelInformation);

        Main.recentBridgedEvents.addRecentEvent(BridgedEventType.CHANNEL_UPDATE, newChannel.id, revoltChannel._id);

        npmlog.info('Discord', `Automatically updated Revolt channel "${discordGuildMapping.revoltChannel}" with Discord channel "${channelId}"`);
    }
}
