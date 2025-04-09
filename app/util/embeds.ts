import { ColorResolvable, EmbedBuilder } from "discord.js";
import { API } from "revolt.js";
import { truncate } from "./truncate";

interface Field {
  name: string;
  content: string;
}

export class RevcordEmbed {
  private title: string | null;
  private description: string | null;
  private fields: Field[];
  private color: ColorResolvable | null;
  private icon_url: string | null;

  constructor() {
    this.title = null;
    this.description = null;
    this.fields = [];
    this.color = null;
    this.icon_url = null;
  }

  setTitle(title: string) {
    this.title = title;
    return this;
  }

  setDescription(description: string) {
    this.description = description;
    return this;
  }

  addField(name: string, content: string) {
    this.fields.push({
      name,
      content,
    });
    return this;
  }

  setColor(color: ColorResolvable) {
    this.color = color;
    return this;
  }

  setIconUrl(url: string) {
    this.icon_url = url;
    return this;
  }

  toDiscord(): EmbedBuilder {
    const embed = new EmbedBuilder();

    if (this.title) {
      embed.setTitle(truncate(this.title, 256));
    }

    if (this.description) {
      embed.setDescription(truncate(this.description, 4096));
    }

    if (this.color) {
      embed.setColor(this.color);
    }

    if (this.icon_url) {
      embed.setThumbnail(this.icon_url);
    }

    for (const field of this.fields) {
      embed.addFields({
        name: truncate(field.name, 256),
        value: truncate(field.content, 1024),
      });
    }

    return embed;
  }

  toRevolt(): API.SendableEmbed {
    const embed: API.SendableEmbed = {
      title: this.title ? truncate(this.title, 100) : undefined,
      description: this.description ? truncate(this.description, 2000) : undefined,
      colour: this.color ? String(this.color) : undefined,
      icon_url: this.icon_url,
    };

    if (this.fields.length > 0) {
      const fields = this.fields.map((field) => ({
        name: truncate(field.name, 256),
        value: truncate(field.content, 1024),
      }));
      // @ts-ignore - The type definition seems to be incorrect
      embed.fields = fields;
    }

    return embed;
  }
}
