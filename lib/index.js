'use strict';

const debug = require('debug')('hmpo:cached-model');
const HmpoModel = require('hmpo-model');

class HmpoCachedModel extends HmpoModel {
    constructor(attrs, options) {
        super(attrs, options);

        if (!options.key) throw new Error('key must be supplied in options');

        this.keyData = options.key + '-data';
        this.keyNextCheck = options.key + '-next-check';
        this.keyLastModified = options.key + '-last-modified';

        if (!this.options.store || typeof this.options.store.getClient !== 'function') throw new Error('store.getClient function must be supplied in options');
    }

    getStoreClient() {
        return this.options.store.getClient();
    }

    async checkStoreLastModified() {
        if (!this.lastModified) return;

        debug('Checking store last modified time', this.options.key);
        const data = await this.getStoreClient().get(this.keyLastModified);
        const lastModified = parseInt(data, 10) || 0;

        if (lastModified && lastModified > this.lastModified) return;

        debug('Store data has not been modified', this.options.key);
        throw HmpoCachedModel.ABORT;
    }

    async getStoreData() {
        debug('Getting store data', this.options.key);
        const data = JSON.parse(await this.getStoreClient().get(this.keyData));

        this.lastModified = Date.now();
        this.reset();
        this.set(data);
    }

    async getNextCheckTime() {
        debug('Checking API next check time', this.options.key);
        const data = await this.getStoreClient().get(this.keyNextCheck);
        const nextCheckTime = parseInt(data, 10) || 0;

        if (nextCheckTime <= Date.now()) return;

        throw HmpoCachedModel.ABORT;
    }

    async setNextCheckTime() {
        debug('Store next check time', this.options.key);
        await this.getStoreClient().set(
            this.keyNextCheck,
            Date.now() + Number(this.options.apiInterval)
        );
    }

    fetchData() {
        return new Promise((resolve, reject) => {
            this.fetch((err, data) => {
                if (err) return reject(err);
                resolve(data);
            });
        });
    }

    async getDataFromAPI() {
        debug('Fetch data from API', this.options.key);
        const data = await this.fetchData();

        this.lastModified = Date.now();
        this.reset();
        this.set(data);
    }

    parse(data) {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return data;
        }
        return { data };
    }

    async storeDataFromAPI() {
        debug('Store data', this.options.key);
        await this.getStoreClient().set(
            this.keyData,
            JSON.stringify(this.toJSON())
        );
    }

    async storeLastModifiedFromAPI() {
        debug('Store modified time', this.options.key);
        await this.getStoreClient().set(
            this.keyLastModified,
            this.lastModified
        );
    }

    start() {
        this.stop();

        if (this.options.storeInterval) {
            this.loadFromStore();
            this.storeTimer = setInterval(
                this.loadFromStore.bind(this),
                this.options.storeInterval
            );
        }

        if (this.options.apiInterval) {
            this.loadFromApi();
            this.apiTimer = setInterval(
                this.loadFromApi.bind(this),
                this.options.apiInterval
            );
        }
    }

    async loadFromStore() {
        try {
            await this.checkStoreLastModified();
            await this.getStoreData();
        } catch (err) {
            if (err instanceof Error) this.emit('error', err);
        }
    }

    async loadFromApi() {
        try {
            await this.getNextCheckTime();
            await this.setNextCheckTime();
            await this.getDataFromAPI();
            await this.storeDataFromAPI();
            await this.storeLastModifiedFromAPI();
        } catch (err) {
            if (err instanceof Error) this.emit('error', err);
        }
    }

    stop() {
        clearInterval(this.storeTimer);
        this.storeTimer = null;
        clearInterval(this.apiTimer);
        this.apiTimer = null;
    }

}

HmpoCachedModel.ABORT = true;

module.exports = HmpoCachedModel;
