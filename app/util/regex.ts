export const DiscordEmojiPattern = /<(:|a:)(.+?):([0-9]{1,22})>/g;
export const DiscordPingPattern = /<(@|@!)([0-9]{1,22})>/g;
export const DiscordChannelPattern = /<#([0-9]{1,22})>/g;

export const RevoltEmojiPattern = /:([0-Z]{1,26}):/g;
export const RevoltPingPattern = /<@([0-Z]{1,26})>/g;
export const RevoltChannelPattern = /<#([0-Z]{1,26})>/g;

export const TrailingNewlines = /[\s\r\n]+$/;