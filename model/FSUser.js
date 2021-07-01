class FSUser {
	constructor(userId, attributes) {
		this.userId = userId;
		this.attributes = attributes;
	}

	addAttribute(key, value) {
		if (!key)
			return;
		if (!this.attributes)
			this.attributes = {};
		this.attributes[key] = value;
	}
}

module.exports = FSUser;
