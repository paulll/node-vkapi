import {API} from "../lib/vkapi"

describe("private token tests", () => {
	const api = new API({
		service_token: "c8dbb40ac8dbb40ac8dbb40a64c8ebf155cc8dbc8dbb40a92df9d61ae3e1068cf1fa8e9",
		access_token: "239cfc5657c98f124d079726eaeb641436e3681b0b49272f2abc86184f8f8d908020951b333f2dcc9f8d1"
	});

	test("single request with access token", async () => {
		const udata = await api.enqueue("users.get", {v: 5.56}, {force_private: true});

		// @ts-ignore
		expect(udata[0].id).toBe(55374766);
	});

	test("multiple requests with access token", async () => {
		const users = Array(25).fill(0).map((_, i) => i);
		const udata = await Promise.all(users.map(async (user) => {
			try {
				return (await api.enqueue("users.get", {v: 5.56, user_ids: user},  {force_private: true}))[0].id;
			} catch (e) {
				return 0;
			}
		}));

		const id_sum = udata.reduce((a,b) => a+b, 0);
		const id_sum_required = users.reduce((a,b) => a+b, 0);
		expect(id_sum === id_sum_required).toBe(true);
	});

});