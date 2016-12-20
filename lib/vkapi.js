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
		url: `https://api.vk.com/method/${method}?v=5.60` + token ? `&access_token=${token}` : '',
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
 *
 * Create vk api request
 * 
 * @param {String} method 	api method
 * @param {Object} data 	key:value request data
 * @param {String} token 	access_token
 * @returns Promise<APIResponse>
 */
exports.request = (method, params, token) => {
	if (token) return enqueue(method, params, token);
	return raw(method, data);
};
