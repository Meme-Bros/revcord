import {
    Client as RevoltClient,
    Channel as RevoltChannel,
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
    GuildChannelCreateOptions as DiscordGuildChannelCreateOptions,
} from "discord.js";
import {
    DataCreateChannel as RevoltDataCreateChannel
} from "revolt-api/esm/types";
import { BridgedEventType } from "../bridgedEvents";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { MappingModel } from "../models/Mapping";
import UniversalExecutor from "../universalExecutor";
import { transformRevoltChannelNameToDiscord } from "../revolt";
import { transformDiscordChannelNameToRevolt } from "../discord";
import { Main } from "../Main";
import { promisedTimeout } from "../util/promise";


export default class ChannelCreateEvent implements IBotEvent
{
    public DISCORD_EVENT = 'channelCreate';
    public REVOLT_EVENT = 'channel/create';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channel: RevoltChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        if (channel.channel_type !== 'TextChannel') {
            npmlog.info('Revolt', `Revolt channel "${channel.name}" was created, but it's not a text channel. Ignoring`);

            return;
        }

        // Wait for a bit, as we might be faster than the recentBridgedEvents
        await promisedTimeout(1000);

        const recentBridgedEvent = Main.recentBridgedEvents.findRecentEventForEitherWay(BridgedEventType.CHANNEL_CREATE, channel._id);

        if (recentBridgedEvent) {
            npmlog.warn('Revolt', `We won't create Discord channel "${channel.name}", as we very recently already handled something similar, ignoring as it's probably our own event`);

            return;
        }

        const universalExecutor = new UniversalExecutor(discord, revolt);
        const revoltServerId = channel.server_id;

        // Grab a random channel mapping item that already has this server linked
        const revoltServerMapping = await MappingModel.findOne({
            where: {
                revoltServer: revoltServerId
            }
        });

        if (! revoltServerMapping) {
            npmlog.error('Revolt', `Attempted to automatically create channel, but Revolt server ID "${revoltServerId}" is unknown. Have you mapped at least one channel before for this server?`);
                
            return;
        }

        const discordGuildId = revoltServerMapping.discordGuild;
        const discordGuild = await discord.guilds.fetch(discordGuildId);

        if (! discordGuild) {
            npmlog.error('Revolt', `We can't find Discord guild with ID "${discordGuildId}".`);

            return;
        }

        const discordChannelInformation: DiscordGuildChannelCreateOptions = {
            type: DiscordChannelType.GuildText,
            name: transformRevoltChannelNameToDiscord(channel.name),
            topic: channel.description,
            nsfw: channel.nsfw
        };

        const existingDiscordChannel = discordGuild.channels.cache.find((channel) => channel.name === discordChannelInformation.name);

        if (existingDiscordChannel) {
            npmlog.warn('Revolt', `The Discord server already has a channel called "${discordChannelInformation.name}", so we won't create/map this channel automatically.`);

            return;
        }

        const discordChannel = await discordGuild.channels.create(discordChannelInformation);

        Main.recentBridgedEvents.addRecentEvent(BridgedEventType.CHANNEL_CREATE, channel._id, discordChannel.id);

        // Make sure the caches are up-to-date
        await discord.channels.fetch(discordChannel.id);
        await revolt.channels.fetch(channel._id);

        await universalExecutor.connect(discordChannel.id, channel._id);
        await Main.refreshMapping();

        npmlog.info('Revolt', `Automatically linked Discord channel "${discordChannel.id}" to Revolt channel "${channel._id}"`);

        await channel.sendMessage(`Discord channel "${discordChannel.name}" (${discordChannel.id}) has been linked to Revolt channel "${channel.name}" (${channel._id})`);
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, channel: DiscordTextChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        if (channel.type !== DiscordChannelType.GuildText) {
            npmlog.info('Discord', `Discord channel "${channel.name}" was created, but it's not a text channel. Ignoring`);

            return;
        }

        // Wait for a bit, as we might be faster than the recentBridgedEvents
        await promisedTimeout(1000);

        const recentBridgedEvent = Main.recentBridgedEvents.findRecentEventForEitherWay(BridgedEventType.CHANNEL_CREATE, channel.id);

        if (recentBridgedEvent) {
            npmlog.warn('Discord', `We won't create Revolt channel "${channel.name}", as we very recently already handled something similar, ignoring as it's probably our own event`);

            return;
        }

        const universalExecutor = new UniversalExecutor(discord, revolt);
        const discordGuildId = channel.guildId;

        // Grab a random channel mapping item that already has this guild linked
        const discordGuildMapping = await MappingModel.findOne({
            where: {
                discordGuild: discordGuildId
            }
        });

        if (! discordGuildMapping) {
            npmlog.error('Discord', `Attempted to automatically create channel, but Discord guild ID "${discordGuildId}" is unknown. Have you mapped at least one channel before for this guild?`);
        
            return;
        }

        const revoltServerId = discordGuildMapping.revoltServer;
        const revoltServer = revolt.servers.get(revoltServerId);

        if (! revoltServer) {
            npmlog.error('Discord', `We can't find Revolt server with ID "${revoltServerId}".`);

            return;
        }

        const revoltChannelInformation: RevoltDataCreateChannel = {
            type: 'Text',
            name: transformDiscordChannelNameToRevolt(channel.name),
            description: channel.topic,
            nsfw: channel.nsfw
        }

        const existingRevoltChannel = revoltServer.channels.find((channel) => channel.name === revoltChannelInformation.name);

        if (existingRevoltChannel) {
            npmlog.warn('Discord', `The Revolt server already has a channel called "${revoltChannelInformation.name}", so we won't create/map this channel automatically.`);
        
            return;
        }

        const revoltChannel = await revoltServer.createChannel(revoltChannelInformation);

        Main.recentBridgedEvents.addRecentEvent(BridgedEventType.CHANNEL_CREATE, channel.id, revoltChannel._id);

        // Make sure the caches are up-to-date
        await discord.channels.fetch(channel.id);
        await revolt.channels.fetch(revoltChannel._id);

        await universalExecutor.connect(channel.id, revoltChannel._id);
        await Main.refreshMapping();

        npmlog.info('Discord', `Automatically linked Discord channel "${channel.id}" to Revolt channel "${revoltChannel._id}"`);

        await channel.send(`Discord channel "${channel.name}" (${channel.id}) has been linked to Revolt channel "${revoltChannelInformation.name}" (${revoltChannel._id})`);
    }
}
