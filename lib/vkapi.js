// bluebird is faster than builtin promises
const Promise = require('bluebird');
// deque is faster then builtin array fifo/lifo methods
const Deque = require('double-ended-queue');
// req-fast is faster then request module and also handles json
const req = Promise.promisify(require('req-fast'));

// Map<token, deque<enqueue arguments[]>>
const queueByToken = new Map;

/**
 * 
 * Request data via api.vk.com immediatly
 * 
 * @param {String} method 	api method
 * @param {Object} data 	key:value request data
 * @param {String} token 	access_token
 * @returns Promise<APIResponse>
 */
const raw = (method, data, token) => {
	return req({
		url: `https://api.vk.com/method/${method}?access_token=${token}`,
		data: data,
		method: 'GET',
		timeout: 10000 // 10s
	}).then(response => {
		if (response.response) {
			return response.response;
		} else {
			throw response.error;
		}
	});
}

/**
 * Enqueue request. 
 * Doesn't make sense for anonymous requests (without token)
 * vk.com has a limit for requests per second per each user session 
 * to avoid api errors we need to throttle request interval client side
 *
 * @param {String} method 	api method
 * @param {Object} data 	key:value request data
 * @param {String} token 	access_token
 * @returns Promise<APIResponse>
 */
const enqueue = (method, data, token) => {
	return new Promise(resolve => {
		const deque = queueByToken.get(token) || new Deque(100);	
		deque.push([method, data, token, reject, resolve]);
		if (deque.length - 1 == 0) {
			queueByToken.set(token, deque);
			const interval = setInterval(() => {
				const curTask = deque.shift();
				const curResolve = curTask.pop();
				const curReject = curTask.pop();
				try {
					const result = raw.apply(null, curTask);
					resolve(result);
				} catch(error) {
					reject(error);
				}
				if (!deque.length) clearInterval(interval);
			}, 400);
		}
	});
}

/**
 * VK now prohibits requests without access tokens.
 * For anonymous requests we should use that service tokens
 * 
 * @type {String}
 */
exports.SERVICE_TOKEN = null;

/**
 * Create vk api request
 * 
 * @param {String} method 	api method
 * @param {Object} data 	key:value request data
 * @param {String} token 	access_token
 * @returns Promise<APIResponse>
 */
exports.request = (method, data, token) => {
	if (!data.v) data.v = 5.60; 
	if (!token) 
		if (!exports.SERVICE_TOKEN) 
			throw new Error("[DEPRECATED]. VK now requires service tokens for such requests") 
		else 
			return raw(method, data, exports.SERVICE_TOKEN);
	return enqueue(method, data, token);
};


/**
 * Login via (username,password) pair
 *
 * @param {String} username
 * @param {String} password
 * @param {Array<String>} scope
 * @returns Promise<OauthResponse>
 */
exports.authorizePassword = (username, password, scope) => {
	return req({
		url: `https://oauth.vk.com/token`,
		data: {grant_type: 'password', client_id: 3697615, client_secret: 'AlVXZFMUqyrnABp8ncuU', username, password, scope: scope.join(',')},
		method: 'GET',
		timeout: 10000 // 10s
	});
}