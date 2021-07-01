const FlagsenseService = require('./services/flagsense');
const FSUser = require('./model/FSUser');
const FSFlag = require('./model/FSFlag');

class Flagsense {
	constructor() {
		const flagsenseServiceMap = {};

		this.createService = function (sdkId, sdkSecret, environment) {
			if (!flagsenseServiceMap.hasOwnProperty(sdkId))
				flagsenseServiceMap[sdkId] = new FlagsenseService(sdkId, sdkSecret, environment);
			return flagsenseServiceMap[sdkId];
		}

		this.user = function (userId, attributes) {
			return new FSUser(userId, attributes);
		}

		this.flag = function (flagId, defaultKey, defaultValue) {
			return new FSFlag(flagId, defaultKey, defaultValue);
		}
	}

	// Below methods can be used on instance returned from createService method
	// initializationComplete()
	// getVariation(fsFlag, fsUser)
}

module.exports = new Flagsense();
