'use strict';

const chai = require('chai');
const { expect } = require('chai');

chai.should();
global.expect = chai.expect;
global.sinon = require('sinon');
chai.use(require('sinon-chai'));

const HmpoCachedModel = require('../../lib');
const HmpoModel = require('hmpo-model');

const hmpoLogger = require('hmpo-logger');
hmpoLogger.config({ app: false, error: false, console: false });

describe('HmpoCachedModel', () => {
    let clock, instance, storeFactory, storeStub, options, cb;

    beforeEach(() => {
        clock = sinon.useFakeTimers(1234567890000);
        sinon.stub(HmpoModel.prototype, 'fetch').yields(null, { a: 1, b: 2 });
        sinon.stub(HmpoModel.prototype, 'reset');
        sinon.stub(HmpoModel.prototype, 'set');
        sinon.stub(HmpoModel.prototype, 'get');
        sinon.stub(HmpoModel.prototype, 'emit');

        storeStub = {
            get: sinon.stub(),
            set: sinon.stub().yields(null)
        };

        storeFactory = {
            getClient: sinon.stub().returns(storeStub)
        };

        options = {
            key: 'root-key',
            store: storeFactory,
            storeInterval: 1000,
            apiInterval: 2000
        };
        instance = new HmpoCachedModel(null, options);

        cb = sinon.stub();
    });

    afterEach(() => {
        HmpoModel.prototype.fetch.restore();
        HmpoModel.prototype.reset.restore();
        HmpoModel.prototype.set.restore();
        HmpoModel.prototype.get.restore();
        HmpoModel.prototype.emit.restore();
        clock.restore();
    });

    it('should be a function', () => {
        HmpoCachedModel.should.be.a('function');
    });

    it('should extend hmpo-model', () => {
        instance.should.be.an.instanceOf(HmpoModel);
    });

    describe('constructor', () => {
        it('should set up keys based on key supplied in options', () => {
            instance.start();
            instance.keyData.should.equal('root-key-data');
            instance.keyNextCheck.should.equal('root-key-next-check');
            instance.keyLastModified.should.equal('root-key-last-modified');
        });

        it('should throw an error if no key is supplied', () => {
            delete options.key;
            expect( () => new HmpoCachedModel(null, options) ).to.throw();
        });

        it('should throw an error if no store is supplied', () => {
            delete options.store;
            expect( () => new HmpoCachedModel(null, options) ).to.throw();
        });

        it('should throw an error if no store getClient function is supplied', () => {
            options.store = {};
            expect( () => new HmpoCachedModel(null, options) ).to.throw();
        });
    });

    describe('checkStoreLastModified', () => {
        beforeEach(() => {
            instance.lastModified = 1234567890000;
        });

        it('should be a function', () => {
            instance.checkStoreLastModified.should.be.a('function');
        });

        it('should call callback if there is no this.lastModified', () => {
            delete instance.lastModified;
            instance.checkStoreLastModified(cb);
            cb.should.have.been.calledWithExactly();
            storeStub.get.should.not.have.been.called;
        });

        it('should call store.get with lastModified key', () => {
            instance.checkStoreLastModified(cb);
            storeStub.get.should.have.been.calledWithExactly('root-key-last-modified', sinon.match.func);
        });

        it('should call callback with no arguments if it is time to fetch from the store', () => {
            storeStub.get.yields(null, '1234567891000');
            instance.checkStoreLastModified(cb);
            cb.should.have.been.calledWithExactly();
        });

        it('should call callback with true if there is no next check in the store', () => {
            storeStub.get.yields(null, '');
            instance.checkStoreLastModified(cb);
            cb.should.have.been.calledWithExactly(true);
        });

        it('should call callback with error from store.get', () => {
            let err = new Error();
            storeStub.get.yields(err);
            instance.checkStoreLastModified(cb);
            cb.should.have.been.calledWithExactly(err);
        });

        it('should call callback with ABORT if it is not time to fetch', () => {
            storeStub.get.yields(null, '1234567880000');
            instance.checkStoreLastModified(cb);
            cb.should.have.been.calledWithExactly(HmpoCachedModel.ABORT);
        });
    });

    describe('getStoreData', () => {
        beforeEach(() => {
            storeStub.get.yields(null, '{"a":1,"b":2}');
        });

        it('should be a function', () => {
            instance.getStoreData.should.be.a('function');
        });

        it('should call store.get with data key', () => {
            instance.getStoreData(cb);
            storeStub.get.should.have.been.calledWithExactly('root-key-data', sinon.match.func);
        });

        it('should call callback with error from store.get', () => {
            let err = new Error();
            storeStub.get.yields(err);
            instance.getStoreData(cb);
            cb.should.have.been.calledWithExactly(err);
        });

        it('should call callback with JSON validation error', () => {
            storeStub.get.yields(null, '{{{');
            instance.getStoreData(cb);
            cb.should.have.been.calledWithExactly(sinon.match.instanceOf(Error));
        });

        it('should set data and call callback', () => {
            instance.getStoreData(cb);
            HmpoModel.prototype.reset.should.have.been.calledWithExactly();
            HmpoModel.prototype.set.should.have.been.calledWithExactly({
                a: 1, b: 2
            });
            instance.lastModified.should.equal(Date.now());
            cb.should.have.been.calledWithExactly();
        });
    });

    describe('getNextCheckTime', () => {
        beforeEach(() => {
            storeStub.get.yields(null, '1234567880000');
        });

        it('should be a function', () => {
            instance.getNextCheckTime.should.be.a('function');
        });

        it('should call store.get with next check key', () => {
            instance.getNextCheckTime(cb);
            storeStub.get.should.have.been.calledWithExactly('root-key-next-check', sinon.match.func);
        });

        it('should call callback with error from store.get', () => {
            let err = new Error();
            storeStub.get.yields(err);
            instance.getNextCheckTime(cb);
            cb.should.have.been.calledWithExactly(err);
        });

        it('should call callback with no args if the store value is invalid', () => {
            storeStub.get.yields(null, '');
            instance.getNextCheckTime(cb);
            cb.should.have.been.calledWithExactly();
        });

        it('should call callback with no args if it is in the past', () => {
            instance.getNextCheckTime(cb);
            cb.should.have.been.calledWithExactly();
        });

        it('should call callback with ABORT if it is in the future', () => {
            storeStub.get.yields(null, '1234567891000');
            instance.getNextCheckTime(cb);
            cb.should.have.been.calledWithExactly(HmpoCachedModel.ABORT);
        });
    });

    describe('setNextCheckTime', () => {
        it('should be a function', () => {
            instance.setNextCheckTime.should.be.a('function');
        });

        it('should set next check time to store', () => {
            instance.setNextCheckTime(cb);
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-next-check',
                1234567892000,
                cb
            );
        });
    });

    describe('getDataFromAPI', () => {
        it('should be a function', () => {
            instance.getDataFromAPI.should.be.a('function');
        });

        it('should call fetch with callback', () => {
            instance.getDataFromAPI(cb);
            HmpoModel.prototype.fetch.should.have.been.calledWithExactly(
                sinon.match.func
            );
        });

        it('should call callback with error from fetch', () => {
            let err = new Error();
            HmpoModel.prototype.fetch.yields(err);
            instance.getDataFromAPI(cb);
            cb.should.have.been.calledWithExactly(err);
        });

        it('should set last modified to current time', () => {
            instance.getDataFromAPI(cb);
            instance.lastModified.should.equal(1234567890000);
        });

        it('should set data to model', () => {
            instance.getDataFromAPI(cb);
            HmpoModel.prototype.reset.should.have.been.calledWithExactly();
            HmpoModel.prototype.set.should.have.been.calledWithExactly({
                a: 1, b: 2
            });
        });

        it('should call the callback', () => {
            instance.getDataFromAPI(cb);
            cb.should.have.been.calledWithExactly();
        });
    });

    describe('parse', () => {
        it('should return an object if data is null', () => {
            instance.parse(null).should.deep.equal({ data: null });
        });
        it('should return an object if data is a number', () => {
            instance.parse(1).should.deep.equal({ data: 1 });
        });
        it('should return an object if data is an array', () => {
            instance.parse([1, 2, 3]).should.deep.equal({ data: [1, 2, 3] });
        });
        it('should return an object if data is an object', () => {
            instance.parse({ a: 1, b: 2 }).should.deep.equal({ a: 1, b: 2 });
        });
    });

    describe('storeDataFromAPI', () => {
        it('should be a function', () => {
            instance.storeDataFromAPI.should.be.a('function');
        });

        it('should set data to store', () => {
            instance.attributes = {a: 1, b: 2};
            instance.storeDataFromAPI(cb);
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-data',
                '{"a":1,"b":2}',
                cb
            );
        });
    });

    describe('storeLastModifiedFromAPI', () => {
        it('should be a function', () => {
            instance.storeLastModifiedFromAPI.should.be.a('function');
        });

        it('should set last modified to store', () => {
            instance.lastModified = 12345678;
            instance.storeLastModifiedFromAPI(cb);
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-last-modified',
                12345678,
                cb
            );
        });
    });

    describe('loadFromStore', () => {
        beforeEach(() => {
            sinon.stub(HmpoCachedModel.prototype, 'checkStoreLastModified').yields();
            sinon.stub(HmpoCachedModel.prototype, 'getStoreData').yields();
        });

        afterEach(() => {
            HmpoCachedModel.prototype.checkStoreLastModified.restore();
            HmpoCachedModel.prototype.getStoreData.restore();
        });

        it('should be a function', () => {
            instance.loadFromStore.should.be.a('function');
        });

        it('should call methods', () => {
            instance.loadFromStore();
            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.have.been.calledOnce;
        });

        it('should stop and emit an error if an error is returned', () => {
            let err = new Error();
            HmpoCachedModel.prototype.checkStoreLastModified.yields(err);

            instance.loadFromStore();

            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.not.have.been.called;
            HmpoModel.prototype.emit.should.have.been.calledWithExactly('error', err);
        });

        it('should stop and not emit an error if ABORT returned', () => {
            HmpoCachedModel.prototype.checkStoreLastModified.yields(HmpoCachedModel.ABORT);

            instance.loadFromStore();

            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.not.have.been.called;
            HmpoModel.prototype.emit.should.not.have.been.called;
        });
    });

    describe('loadFromApi', () => {
        beforeEach(() => {
            sinon.stub(HmpoCachedModel.prototype, 'getNextCheckTime').yields();
            sinon.stub(HmpoCachedModel.prototype, 'setNextCheckTime').yields();
            sinon.stub(HmpoCachedModel.prototype, 'getDataFromAPI').yields();
            sinon.stub(HmpoCachedModel.prototype, 'storeDataFromAPI').yields();
            sinon.stub(HmpoCachedModel.prototype, 'storeLastModifiedFromAPI').yields();
        });

        afterEach(() => {
            HmpoCachedModel.prototype.getNextCheckTime.restore();
            HmpoCachedModel.prototype.setNextCheckTime.restore();
            HmpoCachedModel.prototype.getDataFromAPI.restore();
            HmpoCachedModel.prototype.storeDataFromAPI.restore();
            HmpoCachedModel.prototype.storeLastModifiedFromAPI.restore();
        });

        it('should be a function', () => {
            instance.loadFromApi.should.be.a('function');
        });

        it('should call methods', () => {
            instance.loadFromApi();
            HmpoCachedModel.prototype.getNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.setNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getDataFromAPI.should.have.been.calledOnce;
            HmpoCachedModel.prototype.storeDataFromAPI.should.have.been.calledOnce;
            HmpoCachedModel.prototype.storeLastModifiedFromAPI.should.have.been.calledOnce;
        });

        it('should stop and emit an error if an error is returned', () => {
            let err = new Error();
            HmpoCachedModel.prototype.getNextCheckTime.yields(err);

            instance.loadFromApi();

            HmpoCachedModel.prototype.getNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.setNextCheckTime.should.not.have.been.called;
            HmpoModel.prototype.emit.should.have.been.calledWithExactly('error', err);
        });

        it('should stop and not emit an error if ABORT returned', () => {
            HmpoCachedModel.prototype.getNextCheckTime.yields(HmpoCachedModel.ABORT);

            instance.loadFromApi();

            HmpoCachedModel.prototype.getNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.setNextCheckTime.should.not.have.been.called;
            HmpoModel.prototype.emit.should.not.have.been.called;
        });
    });

    describe('start', () => {
        beforeEach(() => {
            sinon.stub(HmpoCachedModel.prototype, 'stop');
            sinon.stub(HmpoCachedModel.prototype, 'loadFromStore');
            sinon.stub(HmpoCachedModel.prototype, 'loadFromApi');
        });

        afterEach(() => {
            HmpoCachedModel.prototype.stop.restore();
            HmpoCachedModel.prototype.loadFromStore.restore();
            HmpoCachedModel.prototype.loadFromApi.restore();
        });

        it('should be a function', () => {
            instance.start.should.be.a('function');
        });

        it('should call stop', () => {
            instance.start();
            HmpoCachedModel.prototype.stop.should.have.been.calledOnce;
        });

        it('should run the two loading functions', () => {
            instance.start();
            HmpoCachedModel.prototype.loadFromStore.should.have.been.called;
            HmpoCachedModel.prototype.loadFromApi.should.have.been.called;
        });

        it('should create two interval timers', () => {
            instance.start();
            instance.storeTimer.should.be.ok;
            instance.apiTimer.should.be.ok;
        });

        it('should not create store timer if there is no interval in options', () => {
            delete instance.options.storeInterval;
            instance.start();
            HmpoCachedModel.prototype.loadFromStore.should.not.have.been.called;
            expect(instance.storeTimer).to.not.be.ok;
        });

        it('should not create api timer if there is no interval in options', () => {
            delete instance.options.apiInterval;
            instance.start();
            HmpoCachedModel.prototype.loadFromApi.should.not.have.been.called;
            expect(instance.apiTimer).to.not.be.ok;
        });
    });

    describe('stop', () => {
        it('should be a function', () => {
            instance.stop.should.be.a('function');
        });

        it('should clear the two interval timers', () => {
            instance.storeTimer = setInterval(()=>{}, 10000);
            instance.apiTimer = setInterval(()=>{}, 10000);
            instance.stop();
            expect(instance.storeTimer).to.not.be.ok;
            expect(instance.apiTimer).to.not.be.ok;
        });
    });

});
