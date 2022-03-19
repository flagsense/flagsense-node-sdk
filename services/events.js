const cloneDeep = require('lodash.clonedeep');
const exitHook = require('async-exit-hook');
const request = require("requestretry");
const { v4: uuidv4 } = require('uuid');
const Constants = require('../util/constants');
const Utility = require('../util/utility');

class Events {
	constructor(headers, environment) {
		this.data = {};
		this.codeBugs = {};
		this.errors = {};
		this.experimentEvents = {};
		this.requestBodyMap = {};
		this.experimentEventsBodyMap = {};
		this.timeSlot = this.getTimeSlot(new Date());

		this.headers = headers;
		this.body = {
			machineId: uuidv4(),
			sdkType: 'node',
			environment: environment,
			data: null,
			codeBugs: null,
			errors: null,
			time: this.timeSlot
		};

		this.experimentEventsBody = {
			machineId: this.body.machineId,
			sdkType: 'node',
			environment: environment,
			time: this.timeSlot,
			experimentEvents: null
		};

		if (Constants.CAPTURE_EVENTS_FLAG) {
			setTimeout(() => {
				this.sendEvents();
			}, Constants.EVENT_FLUSH_INITIAL_DELAY);
		}

		this.registerShutdownHook();
	}

	addEvaluationCount(flagId, variantKey) {
		try {
			if (!Constants.CAPTURE_EVENTS_FLAG)
				return;

			const currentTimeSlot = this.getTimeSlot(new Date());
			if (currentTimeSlot !== this.timeSlot)
				this.checkAndRefreshData(currentTimeSlot);

			if (this.data.hasOwnProperty(flagId)) {
				if (this.data[flagId].hasOwnProperty(variantKey))
					this.data[flagId][variantKey] = this.data[flagId][variantKey] + 1;
				else
					this.data[flagId][variantKey] = 1;
			} else {
				this.data[flagId] = {
					[variantKey]: 1
				};
			}
		}
		catch (err) {
		}
	}

	addErrorsCount(flagId) {
		try {
			if (!Constants.CAPTURE_EVENTS_FLAG)
				return;

			const currentTimeSlot = this.getTimeSlot(new Date());
			if (currentTimeSlot !== this.timeSlot)
				this.checkAndRefreshData(currentTimeSlot);

			if (this.errors.hasOwnProperty(flagId))
				this.errors[flagId] = this.errors[flagId] + 1;
			else
				this.errors[flagId] = 1;
		}
		catch (err) {
		}
	}

	addCodeBugsCount(flagId, variantKey) {
		try {
			if (!Constants.CAPTURE_EVENTS_FLAG)
				return;

			const currentTimeSlot = this.getTimeSlot(new Date());
			if (currentTimeSlot !== this.timeSlot)
				this.checkAndRefreshData(currentTimeSlot);

			if (this.codeBugs.hasOwnProperty(flagId)) {
				if (this.codeBugs[flagId].hasOwnProperty(variantKey))
					this.codeBugs[flagId][variantKey] = this.codeBugs[flagId][variantKey] + 1;
				else
					this.codeBugs[flagId][variantKey] = 1;
			} else {
				this.codeBugs[flagId] = {
					[variantKey]: 1
				};
			}
		}
		catch (err) {
		}
	}

	recordExperimentEvent(flagId, eventName, variantKey, value) {
		try {
			if (!Constants.CAPTURE_EVENTS_FLAG)
				return;

			const currentTimeSlot = this.getTimeSlot(new Date());
			if (currentTimeSlot !== this.timeSlot)
				this.checkAndRefreshData(currentTimeSlot);

			let metricsMap = {
				count: 1,
				total: value,
				minimum: value,
				maximum: value
			};

			if (this.experimentEvents.hasOwnProperty(flagId)) {
				if (this.experimentEvents[flagId].hasOwnProperty(eventName)) {
					if (this.experimentEvents[flagId][eventName].hasOwnProperty(variantKey)) {
						metricsMap = this.experimentEvents[flagId][eventName][variantKey];
						metricsMap.count = metricsMap.count + 1;
						metricsMap.total = metricsMap.total + value;
						metricsMap.minimum = Math.min(metricsMap.minimum, value);
						metricsMap.maximum = Math.max(metricsMap.maximum, value);
					}
					this.experimentEvents[flagId][eventName][variantKey] = metricsMap;
				} else {
					this.experimentEvents[flagId][eventName] = {
						[variantKey]: metricsMap
					};
				}
			} else {
				this.experimentEvents[flagId] = {
					[eventName]: {
						[variantKey]: metricsMap
					}
				};
			}
		}
		catch (err) {
		}
	}

	checkAndRefreshData(currentTimeSlot) {
		if (currentTimeSlot === this.timeSlot)
			return;
		this.refreshData(currentTimeSlot);
	}

	refreshData(currentTimeSlot) {
		this.body.time = this.timeSlot;
		this.body.data = this.data;
		this.body.codeBugs = this.codeBugs;
		this.body.errors = this.errors;
		this.requestBodyMap[this.timeSlot] = cloneDeep(this.body);

		this.experimentEventsBody.time = this.timeSlot;
		this.experimentEventsBody.experimentEvents = this.experimentEvents;
		this.experimentEventsBodyMap[this.timeSlot] = cloneDeep(this.experimentEventsBody);

		this.timeSlot = currentTimeSlot;
		this.data = {};
		this.codeBugs = {};
		this.errors = {};
		this.experimentEvents = {};
	}

	// This method has been optimized for EVENT_FLUSH_INTERVAL = 5 * 60 * 1000
	initialDelay() {
		if (Constants.EVENT_FLUSH_INTERVAL === 60 * 1000)
			return Constants.EVENT_FLUSH_INTERVAL;

		const currentDate = new Date();
		const currentTimeSlot = this.getTimeSlot(currentDate);
		const expectedStartTime = currentTimeSlot + Constants.EVENT_FLUSH_INTERVAL / 2;
		const diffInSeconds = Math.floor((expectedStartTime - currentDate.getTime()) / 1000);

		if (Math.abs(diffInSeconds) <= 30)
			return Constants.EVENT_FLUSH_INTERVAL - 60 * 1000;

		if (diffInSeconds > 0)
			return Constants.EVENT_FLUSH_INTERVAL + 60 * 1000;

		if (Constants.EVENT_FLUSH_INTERVAL > 2 * 60 * 1000)
			return Constants.EVENT_FLUSH_INTERVAL - 2 * 60 * 1000;

		return 60 * 1000;
	}

	getTimeSlot(date) {
		return new Date(Math.ceil(date / Constants.EVENT_FLUSH_INTERVAL) * Constants.EVENT_FLUSH_INTERVAL).getTime();
	}

	registerShutdownHook() {
		exitHook(async (callback) => {
			this.refreshData(this.getTimeSlot(new Date()));
			await this.sendEvents();
			callback();
		});
	}

	async sendEvents() {
		const currentTimeSlot = this.getTimeSlot(new Date());
		if (currentTimeSlot !== this.timeSlot)
			this.refreshData(currentTimeSlot);

		const asyncTasks = [];
		const timeKeys = Object.keys(this.requestBodyMap);

		for (const time of timeKeys) {
			if (this.requestBodyMap.hasOwnProperty(time)) {
				const requestBody = this.requestBodyMap[time];
				if (requestBody) {
					asyncTasks.push(this.asyncPostRequest('variantsData', requestBody));
					delete this.requestBodyMap[time];
				}
			}
		}

		const experimentEventsTimeKeys = Object.keys(this.experimentEventsBodyMap);
		for (const time of experimentEventsTimeKeys) {
			if (this.experimentEventsBodyMap.hasOwnProperty(time)) {
				const requestBody = this.experimentEventsBodyMap[time];
				if (requestBody) {
					asyncTasks.push(this.asyncPostRequest('experimentEvents', requestBody));
					delete this.experimentEventsBodyMap[time];
				}
			}
		}

		let [err, res] = await Utility.invoke(Promise.all(asyncTasks));
		if (err)
			console.log(err);

		setTimeout(() => {
			this.sendEvents();
		}, Constants.EVENT_FLUSH_INTERVAL);
	}

	asyncPostRequest(api, requestBody) {
		return new Promise((resolve, reject) => {
			// console.log("sending events at: " + new Date());
			// console.log(JSON.stringify(requestBody));
			this.postRequest(api, requestBody, (err, res) => {
				if (err)
					console.log(err);
				return resolve(res);
			});
		});
	}

	postRequest(api, body, callback) {
		let options = {
			method: 'POST',
			json: true,
			headers: this.headers,
			url: Constants.EVENTS_BASE_URL + api,
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

module.exports = Events;
