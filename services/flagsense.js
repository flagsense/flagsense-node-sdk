const request = require('requestretry');
const Utility = require('../util/utility');
const Constants = require('../util/constants');
const FlagsenseError = require('../util/flagsense-error');
const FSVariation = require('../model/FSVariation');
const UserVariant = require('./user-variant');
const Events = require("./events");

class Flagsense {
	constructor(sdkId, sdkSecret, environment) {
		if (!sdkId || !sdkSecret)
			throw new FlagsenseError('Empty sdk params not allowed');

		this.lastUpdatedOn = 0;
		this.maxInitializationWaitTime = Constants.MAX_INITIALIZATION_WAIT_TIME;
		this.environment = environment;
		if (!environment || Constants.ENVIRONMENTS.indexOf(environment) === -1)
			this.environment = 'PROD';

		this.headers = {};
		this.headers[Constants.HEADERS.AUTH_TYPE] = 'sdk';
		this.headers[Constants.HEADERS.SDK_ID] = sdkId;
		this.headers[Constants.HEADERS.SDK_SECRET] = sdkSecret;

		this.data = {
			segments: null,
			flags: null,
			experiments: null
		};

		this.events = new Events(this.headers, this.environment);
		this.userVariant = new UserVariant(this.data);

		this.fetchLatest();
		const data_refresh_interval = Constants.DATA_REFRESH_INTERVAL >= 60 * 1000 ? Constants.DATA_REFRESH_INTERVAL : 5 * 60 * 1000;
		setInterval(this.fetchLatest.bind(this), data_refresh_interval);
	}

	initializationComplete() {
		return this.lastUpdatedOn > 0;
	}

	// Returns a promise which is resolved after the initialization is complete
	waitForInitializationComplete() {
		return Utility.waitFor(this.initializationComplete.bind(this), this.maxInitializationWaitTime);
	}

	async waitForInitializationCompleteAsync() {
		await Utility.invoke(
			Utility.waitFor(this.initializationComplete.bind(this), this.maxInitializationWaitTime)
		);
	}

	setMaxInitializationWaitTime(timeInMillis) {
		this.maxInitializationWaitTime = timeInMillis;
	}

	getVariation(fsFlag, fsUser) {
		const variant = this.getVariant(fsFlag.flagId, fsUser.userId, fsUser.attributes, {
			key: fsFlag.defaultKey,
			value: fsFlag.defaultValue
		});
		return new FSVariation(variant.key, variant.value);
	}

	recordEvent(fsUser, flagId, eventName, value) {
		if (!fsUser || !flagId || !eventName || this.lastUpdatedOn === 0)
			return;
		if (value === undefined)
			value = 1;

		const experiment = this.data.experiments[flagId];
		if (!experiment || !experiment.eventNames || experiment.eventNames.indexOf(eventName) === -1)
			return;

		const variantKey = this.getVariantKey(fsUser, flagId);
		if (variantKey === '')
			return;
		this.events.recordExperimentEvent(flagId, eventName, variantKey, value);
	}

	recordCodeError(fsFlag, fsUser) {
		if (!fsFlag || !fsUser)
			return;

		const variantKey = this.getVariantKey(fsUser, fsFlag.flagId);
		if (fsFlag.flagId && variantKey)
			this.events.addCodeBugsCount(fsFlag.flagId, variantKey);
	}

	getVariant(flagId, userId, attributes, defaultVariant) {
		try {
			if (this.lastUpdatedOn === 0)
				throw new FlagsenseError('Loading data');
			const variant = this.userVariant.evaluate(userId.toString(), attributes, flagId);
			this.events.addEvaluationCount(flagId, variant.key);
			return variant;
		}
		catch (err) {
			// console.error(err);
			this.events.addEvaluationCount(flagId, (defaultVariant && defaultVariant.key) ? defaultVariant.key : "default");
			this.events.addErrorsCount(flagId);
			return defaultVariant;
		}
	}

	getVariantKey(fsUser, flagId) {
		try {
			if (this.lastUpdatedOn === 0)
				throw new FlagsenseError('Loading data');
			return this.userVariant.evaluate(fsUser.userId.toString(), fsUser.attributes, flagId).key;
		}
		catch (err) {
			return '';
		}
	}

	fetchLatest() {
		// console.log("fetching data at: " + new Date());

		let body = {
			environment: this.environment,
			lastUpdatedOn: this.lastUpdatedOn
		};

		this.postRequest('fetchLatest', body, (err, res) => {
			if (err)
				console.log(err);

			if (err || !res)
				return;

			if (res.lastUpdatedOn && res.segments && res.flags && res.experiments) {
				if (!Utility.isEmpty(res.segments))
					this.data.segments = res.segments;
				if (!Utility.isEmpty(res.flags))
					this.data.flags = res.flags;
				if (!Utility.isEmpty(res.experiments))
					this.data.experiments = res.experiments;
				this.lastUpdatedOn = res.lastUpdatedOn;
			}
		});
	}

	postRequest(api, body, callback) {
		let options = {
			method: 'POST',
			json: true,
			headers: this.headers,
			url: Constants.BASE_URL + api,
			body: body,
			maxAttempts: 5,
			retryDelay: 5000,
			retryStrategy: request.RetryStrategies.HTTPOrNetworkError
		};

		request(options, (err, res, resBody) => {
			if (err)
				return callback(err);
			if (res.statusCode !== 200)
				return callback(res.statusCode);
			return callback(null, resBody);
		});
	}
}

module.exports = Flagsense;
