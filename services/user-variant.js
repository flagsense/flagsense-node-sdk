const murmurhash = require('murmurhash');
const compareVersions = require('compare-versions');
const Utility = require('../util/utility');
const Constants = require('../util/constants');
const FlagsenseError = require('../util/flagsense-error');

class UserVariant {
	constructor(data) {
		this.data = data;
	}

	evaluate(userId, attributes, flagId) {
		if (!flagId || !userId)
			throw new FlagsenseError("Bad Request");

		if (!attributes)
			attributes = {};

		const flag = this.data.flags[flagId];
		if (!flag)
			throw new FlagsenseError("Flag not found");

		const userVariantKey = this.getUserVariantKey(userId.toString(), attributes, flag);
		return {
			key: userVariantKey,
			value: flag.variants[userVariantKey].value
		};
	}

	getUserVariantKey(userId, attributes, flag) {
		const envData = flag.envData;
		if (envData.status === 'INACTIVE')
			return envData.offVariant;

		if (!this.matchesPrerequisites(userId, attributes, envData.prerequisites))
			return envData.offVariant;

		const targetUsers = envData.targetUsers;
		if (targetUsers && targetUsers.hasOwnProperty(userId))
			return targetUsers[userId];

		const targetSegmentsOrder = envData.targetSegmentsOrder;
		if (targetSegmentsOrder) {
			for (const targetSegment of targetSegmentsOrder)
				if (this.isUserInSegment(userId, attributes, targetSegment))
					return this.allocateTrafficVariant(userId, flag, envData.targetSegments[targetSegment]);
		}

		return this.allocateTrafficVariant(userId, flag, envData.traffic);
	}

	matchesPrerequisites(userId, attributes, prerequisites) {
		if (!prerequisites)
			return true;

		for (const prerequisite of prerequisites) {
			if (!this.isUserInSegment(userId, attributes, prerequisite))
				return false;
		}

		return true;
	}

	isUserInSegment(userId, attributes, segmentId) {
		const segment = this.data.segments[segmentId];
		if (!segment)
			return false;

		const andRules = segment.rules;
		for (const andRule of andRules) {
			if (!this.matchesAndRule(userId, attributes, andRule))
				return false;
		}

		return true;
	}

	matchesAndRule(userId, attributes, orRules) {
		for (const orRule of orRules) {
			if (this.matchesRule(userId, attributes, orRule))
				return true;
		}
		return false;
	}

	matchesRule(userId, attributes, rule) {
		const attributeValue = this.getAttributeValue(userId, attributes, rule.key);
		if (!attributeValue)
			return false;

		try {
			let userMatchesRule;

			switch (rule.type) {
				case 'INT':
				case 'DOUBLE':
					userMatchesRule = this.matchesNumberRule(rule, attributeValue);
					break;

				case 'BOOL':
					userMatchesRule = this.matchesBoolRule(rule, attributeValue);
					break;

				case 'STRING':
					userMatchesRule = this.matchesStringRule(rule, attributeValue);
					break;

				case 'VERSION':
					userMatchesRule = this.matchesVersionRule(rule, attributeValue);
					break;

				default:
					userMatchesRule = false;
			}

			return userMatchesRule === rule.match;
		}
		catch (err) {
			return false;
		}
	}

	getAttributeValue(userId, attributes, key) {
		const attributesContainsKey = attributes && attributes.hasOwnProperty(key);
		if (attributesContainsKey)
			return attributes[key];
		return key === 'id' ? userId : null;
	}

	matchesNumberRule(rule, attributeValue) {
		const values = rule.values;
		switch (rule.operator) {
			case 'LT':
				return attributeValue < values[0];

			case 'LTE':
				return attributeValue <= values[0];

			case 'EQ':
				return attributeValue === values[0];

			case 'GT':
				return attributeValue > values[0];

			case 'GTE':
				return attributeValue >= values[0];

			case 'IOF':
				return values.indexOf(attributeValue) !== -1;

			default:
				return false;
		}
	}

	matchesBoolRule(rule, attributeValue) {
		const values = rule.values;

		if (rule.operator === 'EQ')
			return attributeValue === values[0];

		return false;
	}

	matchesStringRule(rule, attributeValue) {
		const values = rule.values;
		switch (rule.operator) {
			case 'EQ':
				return attributeValue === values[0];

			case 'HAS':
				return attributeValue.indexOf(values[0]) !== -1;

			case 'SW':
				return attributeValue.startsWith(values[0]);

			case 'EW':
				return attributeValue.endsWith(values[0]);

			case 'IOF':
				return values.indexOf(attributeValue) !== -1;

			default:
				return false;
		}
	}

	matchesVersionRule(rule, attributeValue) {
		const values = rule.values;
		if (!compareVersions.validate(attributeValue))
			attributeValue = '0.0';

		switch (rule.operator) {
			case 'LT':
				return compareVersions(attributeValue, values[0]) < 0;

			case 'LTE':
				return compareVersions(attributeValue, values[0]) <= 0;

			case 'EQ':
				return compareVersions(attributeValue, values[0]) === 0;

			case 'GT':
				return compareVersions(attributeValue, values[0]) > 0;

			case 'GTE':
				return compareVersions(attributeValue, values[0]) >= 0;

			case 'IOF':
				for (let value of values)
					if (compareVersions(attributeValue, value) === 0)
						return true;
				return false;

			default:
				return false;
		}
	}

	allocateTrafficVariant(userId, flag, traffic) {
		if (Object.keys(traffic).length === 1)
			return Object.keys(traffic)[0];

		const bucketingId = userId + flag.id;
		const variantsOrder = flag.variantsOrder;

		const hashValue = murmurhash.v3(bucketingId, flag.seed);
		const ratio = hashValue / Constants.MAX_HASH_VALUE;
		const bucketValue = Math.floor(Constants.TOTAL_THREE_DECIMAL_TRAFFIC * ratio);

		let endOfRange = 0;
		for (const variant of variantsOrder) {
			endOfRange += Utility.getOrDefault(traffic, variant, 0);
			if (bucketValue < endOfRange)
				return variant;
		}

		return variantsOrder[variantsOrder.length - 1];
	}
}

module.exports = UserVariant;
