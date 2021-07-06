const functions = {};

functions.isEmpty = function (obj) {
	if (!obj)
		return true;

	if (obj.constructor === Array)
		return obj.length === 0;

	return Object.keys(obj).length === 0;
}

functions.getOrDefault = function (obj, key, defaultValue) {
	if (obj.hasOwnProperty(key))
		return obj[key];
	return defaultValue;
}

functions.invoke = function (promise) {
	return promise
		.then((data) => {
			return [ null, data ];
		})
		.catch((err) => {
			return [ err, null ];
		});
}

functions.waitFor = function (conditionFunction) {
	const poll = resolve => {
		if (conditionFunction())
			resolve();
		else
			setTimeout(() => poll(resolve), 500);
	}
	return new Promise(poll);
}

module.exports = functions;
