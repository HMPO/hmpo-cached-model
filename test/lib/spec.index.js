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

async function expectRejected(promise, expected) {
    try {
        await promise;
        throw new Error('Expected promise to reject');
    } catch (err) {
        if (expected && expected.prototype instanceof Error) {
            expect(err).to.be.instanceOf(expected);
            return;
        }

        expect(err).to.equal(expected);
    }
}

describe('HmpoCachedModel', () => {
    let clock, instance, storeFactory, storeStub, options;

    beforeEach(() => {
        clock = sinon.useFakeTimers(1234567890000);
        sinon.stub(HmpoModel.prototype, 'fetch').yields(null, { a: 1, b: 2 });
        sinon.stub(HmpoModel.prototype, 'reset');
        sinon.stub(HmpoModel.prototype, 'set');
        sinon.stub(HmpoModel.prototype, 'get');
        sinon.stub(HmpoModel.prototype, 'emit');

        storeStub = {
            get: sinon.stub().resolves(),
            set: sinon.stub().resolves()
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
            expect(() => new HmpoCachedModel(null, options)).to.throw();
        });

        it('should throw an error if no store is supplied', () => {
            delete options.store;
            expect(() => new HmpoCachedModel(null, options)).to.throw();
        });

        it('should throw an error if no store getClient function is supplied', () => {
            options.store = {};
            expect(() => new HmpoCachedModel(null, options)).to.throw();
        });
    });

    describe('checkStoreLastModified', () => {
        beforeEach(() => {
            instance.lastModified = 1234567890000;
        });

        it('should be a function', () => {
            instance.checkStoreLastModified.should.be.a('function');
        });

        it('should resolve if there is no this.lastModified', async () => {
            delete instance.lastModified;
            await instance.checkStoreLastModified();
            storeStub.get.should.not.have.been.called;
        });

        it('should call store.get with lastModified key', async () => {
            await expectRejected(instance.checkStoreLastModified(), HmpoCachedModel.ABORT);
            storeStub.get.should.have.been.calledWithExactly('root-key-last-modified');
        });

        it('should resolve if it is time to fetch from the store', async () => {
            storeStub.get.resolves('1234567891000');
            await instance.checkStoreLastModified();
        });

        it('should reject with ABORT if there is no next check in the store', async () => {
            storeStub.get.resolves('');
            await expectRejected(instance.checkStoreLastModified(), HmpoCachedModel.ABORT);
        });

        it('should reject with error from store.get', async () => {
            let err = new Error();
            storeStub.get.rejects(err);
            await expectRejected(instance.checkStoreLastModified(), err);
        });

        it('should reject with ABORT if it is not time to fetch', async () => {
            storeStub.get.resolves('1234567880000');
            await expectRejected(instance.checkStoreLastModified(), HmpoCachedModel.ABORT);
        });
    });

    describe('getStoreData', () => {
        beforeEach(() => {
            storeStub.get.resolves('{"a":1,"b":2}');
        });

        it('should be a function', () => {
            instance.getStoreData.should.be.a('function');
        });

        it('should call store.get with data key', async () => {
            await instance.getStoreData();
            storeStub.get.should.have.been.calledWithExactly('root-key-data');
        });

        it('should reject with error from store.get', async () => {
            let err = new Error();
            storeStub.get.rejects(err);
            await expectRejected(instance.getStoreData(), err);
        });

        it('should reject with JSON validation error', async () => {
            storeStub.get.resolves('{{{');
            await expectRejected(instance.getStoreData(), SyntaxError);
        });

        it('should set data and resolve', async () => {
            await instance.getStoreData();
            HmpoModel.prototype.reset.should.have.been.calledWithExactly();
            HmpoModel.prototype.set.should.have.been.calledWithExactly({
                a: 1, b: 2
            });
            instance.lastModified.should.equal(Date.now());
        });
    });

    describe('getNextCheckTime', () => {
        beforeEach(() => {
            storeStub.get.resolves('1234567880000');
        });

        it('should be a function', () => {
            instance.getNextCheckTime.should.be.a('function');
        });

        it('should call store.get with next check key', async () => {
            await instance.getNextCheckTime();
            storeStub.get.should.have.been.calledWithExactly('root-key-next-check');
        });

        it('should reject with error from store.get', async () => {
            let err = new Error();
            storeStub.get.rejects(err);
            await expectRejected(instance.getNextCheckTime(), err);
        });

        it('should resolve if the store value is invalid', async () => {
            storeStub.get.resolves('');
            await instance.getNextCheckTime();
        });

        it('should resolve if it is in the past', async () => {
            await instance.getNextCheckTime();
        });

        it('should reject with ABORT if it is in the future', async () => {
            storeStub.get.resolves('1234567891000');
            await expectRejected(instance.getNextCheckTime(), HmpoCachedModel.ABORT);
        });
    });

    describe('setNextCheckTime', () => {
        it('should be a function', () => {
            instance.setNextCheckTime.should.be.a('function');
        });

        it('should set next check time to store', async () => {
            await instance.setNextCheckTime();
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-next-check',
                1234567892000
            );
        });
    });

    describe('getDataFromAPI', () => {
        it('should be a function', () => {
            instance.getDataFromAPI.should.be.a('function');
        });

        it('should call fetch with callback', async () => {
            await instance.getDataFromAPI();
            HmpoModel.prototype.fetch.should.have.been.calledWithExactly(
                sinon.match.func
            );
        });

        it('should reject with error from fetch', async () => {
            let err = new Error();
            HmpoModel.prototype.fetch.yields(err);
            await expectRejected(instance.getDataFromAPI(), err);
        });

        it('should set last modified to current time', async () => {
            await instance.getDataFromAPI();
            instance.lastModified.should.equal(1234567890000);
        });

        it('should set data to model', async () => {
            await instance.getDataFromAPI();
            HmpoModel.prototype.reset.should.have.been.calledWithExactly();
            HmpoModel.prototype.set.should.have.been.calledWithExactly({
                a: 1, b: 2
            });
        });

        it('should resolve', async () => {
            await instance.getDataFromAPI();
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

        it('should set data to store', async () => {
            instance.attributes = {a: 1, b: 2};
            await instance.storeDataFromAPI();
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-data',
                '{"a":1,"b":2}'
            );
        });
    });

    describe('storeLastModifiedFromAPI', () => {
        it('should be a function', () => {
            instance.storeLastModifiedFromAPI.should.be.a('function');
        });

        it('should set last modified to store', async () => {
            instance.lastModified = 12345678;
            await instance.storeLastModifiedFromAPI();
            storeStub.set.should.have.been.calledWithExactly(
                'root-key-last-modified',
                12345678
            );
        });
    });

    describe('loadFromStore', () => {
        beforeEach(() => {
            sinon.stub(HmpoCachedModel.prototype, 'checkStoreLastModified').resolves();
            sinon.stub(HmpoCachedModel.prototype, 'getStoreData').resolves();
        });

        afterEach(() => {
            HmpoCachedModel.prototype.checkStoreLastModified.restore();
            HmpoCachedModel.prototype.getStoreData.restore();
        });

        it('should be a function', () => {
            instance.loadFromStore.should.be.a('function');
        });

        it('should call methods', async () => {
            await instance.loadFromStore();
            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.have.been.calledOnce;
        });

        it('should stop and emit an error if an error is returned', async () => {
            let err = new Error();
            HmpoCachedModel.prototype.checkStoreLastModified.rejects(err);

            await instance.loadFromStore();

            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.not.have.been.called;
            HmpoModel.prototype.emit.should.have.been.calledWithExactly('error', err);
        });

        it('should stop and not emit an error if ABORT returned', async () => {
            HmpoCachedModel.prototype.checkStoreLastModified.rejects(HmpoCachedModel.ABORT);

            await instance.loadFromStore();

            HmpoCachedModel.prototype.checkStoreLastModified.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getStoreData.should.not.have.been.called;
            HmpoModel.prototype.emit.should.not.have.been.called;
        });
    });

    describe('loadFromApi', () => {
        beforeEach(() => {
            sinon.stub(HmpoCachedModel.prototype, 'getNextCheckTime').resolves();
            sinon.stub(HmpoCachedModel.prototype, 'setNextCheckTime').resolves();
            sinon.stub(HmpoCachedModel.prototype, 'getDataFromAPI').resolves();
            sinon.stub(HmpoCachedModel.prototype, 'storeDataFromAPI').resolves();
            sinon.stub(HmpoCachedModel.prototype, 'storeLastModifiedFromAPI').resolves();
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

        it('should call methods', async () => {
            await instance.loadFromApi();
            HmpoCachedModel.prototype.getNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.setNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.getDataFromAPI.should.have.been.calledOnce;
            HmpoCachedModel.prototype.storeDataFromAPI.should.have.been.calledOnce;
            HmpoCachedModel.prototype.storeLastModifiedFromAPI.should.have.been.calledOnce;
        });

        it('should stop and emit an error if an error is returned', async () => {
            let err = new Error();
            HmpoCachedModel.prototype.getNextCheckTime.rejects(err);

            await instance.loadFromApi();

            HmpoCachedModel.prototype.getNextCheckTime.should.have.been.calledOnce;
            HmpoCachedModel.prototype.setNextCheckTime.should.not.have.been.called;
            HmpoModel.prototype.emit.should.have.been.calledWithExactly('error', err);
        });

        it('should stop and not emit an error if ABORT returned', async () => {
            HmpoCachedModel.prototype.getNextCheckTime.rejects(HmpoCachedModel.ABORT);

            await instance.loadFromApi();

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
            instance.storeTimer = setInterval(() => {}, 10000);
            instance.apiTimer = setInterval(() => {}, 10000);
            instance.stop();
            expect(instance.storeTimer).to.not.be.ok;
            expect(instance.apiTimer).to.not.be.ok;
        });
    });

});
