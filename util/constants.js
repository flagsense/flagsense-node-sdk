module.exports = {
	HEADERS: {
		AUTH_TYPE: 'authType',
		SDK_ID: 'sdkId',
		SDK_SECRET: 'sdkSecret'
	},
	BASE_URL: 'https://app-apis.flagsense.com/v1/sdk-service/',
	EVENTS_BASE_URL: 'https://app-events.flagsense.com/v1/events-service/',

	ENVIRONMENTS: ['DEV', 'STAGE', 'PROD'],
	MAX_HASH_VALUE: Math.pow(2, 32),
	TOTAL_THREE_DECIMAL_TRAFFIC: 100000,
	DATA_REFRESH_INTERVAL: 5 * 60 * 1000,
	CAPTURE_EVENTS_FLAG: true,
	EVENT_FLUSH_INTITAL_DELAY: 2 * 60 * 1000,
	EVENT_FLUSH_INTERVAL: 5 * 60 * 1000
};
