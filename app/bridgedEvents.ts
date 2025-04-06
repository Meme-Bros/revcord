import npmlog from "npmlog";

export enum BridgedEventType {
    CHANNEL_CREATE,
    CHANNEL_UPDATE,
}

export interface BridgedEventItem {
    eventType: BridgedEventType,
    from: string,
    to: string,
}

export class BridgedEvents {
    private recentEvents: BridgedEventItem[] = [];

    /**
     * Search for a specific event that recently took place,
     * can be used to prevent infinite loops in case it's not possible to figure out the author (ex: Channel events)
     * 
     * @param eventType The type of the event, what was the trigger for this event?
     * @param from (Optional if empty string) Relevant ID that the event was send from (ex: channel ID, guild/server ID, etc.)
     * @param to (Optional if empty string) Relevant ID that the event was send to (ex: channel ID, guild/server ID, etc.)
     * @returns 
     */
    public findRecentEvent(eventType: BridgedEventType, from: string = "", to: string = ""): BridgedEventItem|null {
        const event: BridgedEventItem = {
            eventType,
            from,
            to
        };

        return this.recentEvents.find((recentEvent: BridgedEventItem) => 
            (
                (recentEvent.eventType === event.eventType) &&

                // Optionally check "from" if it's set
                (from === "" ? true : recentEvent.from === event.from) &&
 
                // Optionally check "to" if it's set
                (to === "" ? true : recentEvent.to === event.to)
            )
        );
    }

    /**
     * Search for a specific event that recently took place,
     * will return if from or to matches the ID together with the even type
     * @param eventType 
     * @param id 
     */
    public findRecentEventForEitherWay(eventType: BridgedEventType, id: string): BridgedEventItem|null {
        // Try From -> To
        const fromTo = this.findRecentEvent(eventType, id, "");

        if (fromTo) {
            return fromTo;
        }

        // Try To -> From
        return this.findRecentEvent(eventType, "", id);
    }

    /**
     * Add a recent event to the events list that will automatically expire after some time
     * 
     * @param eventType The type of the event, what was the trigger for this event?
     * @param from Relevant ID that the event was send from (ex: channel ID, guild/server ID, etc.)
     * @param to Relevant ID that the event was send to (ex: channel ID, guild/server ID, etc.)
     * @param ttl Amount of seconds before this recent event is automatically removed
     */
    public addRecentEvent(eventType: BridgedEventType, from: string, to: string, ttl: number = 10): void {
        const event: BridgedEventItem = {
            eventType,
            from,
            to
        }

        this.recentEvents.push(event);

        // Automatically remove it after it's no longer relevant
        setTimeout(() => this.removeRecentEvent(event), ttl * 1000);
    }

    private removeRecentEvent(event: BridgedEventItem): void {
        const index = this.recentEvents.findIndex((recentEvent: BridgedEventItem) => 
            (
                recentEvent.eventType === event.eventType &&
                recentEvent.from === event.from &&
                recentEvent.to === event.to
            )
        );

        if (index === -1) {
            // Very strange to be in here 🤔
            npmlog.warn('BridgedEvents', `Trying to remove a event, but it doesn't seem to exist? Event: ${JSON.stringify(event)}`);

            return;
        }

        this.recentEvents.splice(index, 1);
    }
}