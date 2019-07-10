import {API} from "../lib/vkapi"

describe("basic tests", () => {
	test("request with service token", async () => {
		const api = new API({
			service_token: "c8dbb40ac8dbb40ac8dbb40a64c8ebf155cc8dbc8dbb40a92df9d61ae3e1068cf1fa8e9",
			access_token: false
		});

		const udata = await api.enqueue("users.get", {user_ids: "1", v:5.56});

		// @ts-ignore
		expect(udata[0].id).toBe(1);
	});
});