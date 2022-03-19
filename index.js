const FlagsenseService = require('./services/flagsense');
const FSUser = require('./model/FSUser');
const FSFlag = require('./model/FSFlag');

const flagsenseServiceMap = {};

exports.createService = function (sdkId, sdkSecret, environment) {
	if (!flagsenseServiceMap.hasOwnProperty(sdkId))
		flagsenseServiceMap[sdkId] = new FlagsenseService(sdkId, sdkSecret, environment);
	return flagsenseServiceMap[sdkId];
}

exports.user = function (userId, attributes) {
	return new FSUser(userId, attributes);
}

exports.flag = function (flagId, defaultKey, defaultValue) {
	return new FSFlag(flagId, defaultKey, defaultValue);
}

// Below methods can be used on instance returned from createService method
// initializationComplete()
// waitForInitializationComplete()
// getVariation(fsFlag, fsUser)
// recordEvent(fsUser, flagId, eventName, value)
// recordCodeError(fsFlag, fsUser)
