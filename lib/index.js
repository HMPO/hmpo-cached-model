'use strict';

const debug = require('debug')('hmpo:cached-model');
const HmpoModel = require('hmpo-model');
const async = require('async');

class HmpoCachedModel extends HmpoModel {
    constructor(attrs, options) {
        super(attrs, options);

        if (!options.key) throw new Error('key must be supplied in options');

        this.keyData = options.key + '-data';
        this.keyNextCheck = options.key + '-next-check';
        this.keyLastModified = options.key + '-last-modified';

        if (!this.options.store || typeof this.options.store.getClient !== 'function') throw new Error('store.getClient function must be supplied in options');
    }

    checkStoreLastModified(cb) {
        if (!this.lastModified) return cb();
        debug('Checking store last modified time', this.options.key);
        this.options.store.getClient().get(
            this.keyLastModified,
            (err, data) => {
                if (err) return cb(err);
                let lastModified = parseInt(data, 10) || 0;
                if (lastModified && lastModified > this.lastModified) return cb();
                debug('Store data has not been modified', this.options.key);
                cb(HmpoCachedModel.ABORT);
            }
        );
    }

    getStoreData(cb) {
        debug('Getting store data', this.options.key);
        this.options.store.getClient().get(
            this.keyData,
            (err, data) => {
                if (err) return cb(err);
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    return cb(e);
                }

                this.lastModified = Date.now();
                this.reset();
                this.set(data);

                cb();
            }
        );
    }

    getNextCheckTime(cb) {
        debug('Checking API next check time', this.options.key);
        this.options.store.getClient().get(
            this.keyNextCheck,
            (err, data) => {
                if (err) return cb(err);
                let nextCheckTime = parseInt(data, 10) || 0;
                if (nextCheckTime <= Date.now()) return cb();
                cb(HmpoCachedModel.ABORT);
            }
        );
    }

    setNextCheckTime(cb) {
        debug('Store next check time', this.options.key);
        this.options.store.getClient().set(
            this.keyNextCheck,
            Date.now() + this.options.apiInterval,
            cb
        );
    }

    getDataFromAPI(cb) {
        debug('Fetch data from API', this.options.key);
        this.fetch((err, data) => {
            if (err) return cb(err);
            this.lastModified = Date.now();
            this.reset();
            this.set(data);
            cb();
        });
    }

    parse(data) {
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return data;
        }
        return { data };
    }

    storeDataFromAPI(cb) {
        debug('Store data', this.options.key);
        this.options.store.getClient().set(
            this.keyData,
            JSON.stringify(this.toJSON()),
            cb
        );
    }

    storeLastModifiedFromAPI(cb) {
        debug('Store modified time', this.options.key);
        this.options.store.getClient().set(
            this.keyLastModified,
            this.lastModified,
            cb
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

    loadFromStore() {
        async.series([
            this.checkStoreLastModified.bind(this),
            this.getStoreData.bind(this),
        ], err => { if (err instanceof Error) this.emit('error', err); });
    }

    loadFromApi() {
        async.series([
            this.getNextCheckTime.bind(this),
            this.setNextCheckTime.bind(this),
            this.getDataFromAPI.bind(this),
            this.storeDataFromAPI.bind(this),
            this.storeLastModifiedFromAPI.bind(this)
        ], err => { if (err instanceof Error) this.emit('error', err); });
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
