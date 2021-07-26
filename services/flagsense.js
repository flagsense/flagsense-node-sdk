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
		this.environment = environment;
		if (!environment || Constants.ENVIRONMENTS.indexOf(environment) === -1)
			this.environment = 'PROD';

		this.headers = {};
		this.headers[Constants.HEADERS.AUTH_TYPE] = 'sdk';
		this.headers[Constants.HEADERS.SDK_ID] = sdkId;
		this.headers[Constants.HEADERS.SDK_SECRET] = sdkSecret;

		this.data = {
			segments: null,
			flags: null
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
		return Utility.waitFor(this.initializationComplete.bind(this));
	}

	getVariation(fsFlag, fsUser) {
		const variant = this.getVariant(fsFlag.flagId, fsUser.userId, fsUser.attributes, {
			key: fsFlag.defaultKey,
			value: fsFlag.defaultValue
		});
		return new FSVariation(variant.key, variant.value);
	}

	recordCodeError(flagId, variationKey) {
		if (flagId && variationKey)
			this.events.addCodeBugsCount(flagId, variationKey);
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

			if (res.lastUpdatedOn && res.segments && res.flags) {
				if (!Utility.isEmpty(res.segments))
					this.data.segments = res.segments;
				if (!Utility.isEmpty(res.flags))
					this.data.flags = res.flags;
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
