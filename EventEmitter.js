// js/utils/EventEmitter.js - 이벤트 시스템
export class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(eventName, callback) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
        return this;
    }

    off(eventName, callback) {
        if (!this.events[eventName]) return this;

        if (callback) {
            this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
        } else {
            delete this.events[eventName];
        }
        return this;
    }

    emit(eventName, data) {
        if (!this.events[eventName]) return this;

        this.events[eventName].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event handler for '${eventName}':`, error);
            }
        });
        return this;
    }

    once(eventName, callback) {
        const onceWrapper = (data) => {
            callback(data);
            this.off(eventName, onceWrapper);
        };
        return this.on(eventName, onceWrapper);
    }

    removeAllListeners(eventName) {
        if (eventName) {
            delete this.events[eventName];
        } else {
            this.events = {};
        }
        return this;
    }

    listenerCount(eventName) {
        return this.events[eventName] ? this.events[eventName].length : 0;
    }

    getEventNames() {
        return Object.keys(this.events);
    }
}