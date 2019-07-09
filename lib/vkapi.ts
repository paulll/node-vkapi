// @ts-ignore
import Promise from "bluebird";
import fetch from "node-fetch";
import PriorityQueue from "fastpriorityqueue";

fetch.Promise = Promise;

/**
 * API Вконтакте
 *
 * Фичи
 *  + Анонимные запросы через service_token
 *  + Троттлинг запросов с access_token
 *  + Повтор запросов при ошибке
 *  + Повтор запросов при таймауте
 *  + Использование access_token в качестве fallback
 *  + Приоритезация запросов
 *  + Ограничение на количество параллельных запросов
 *  + Упаковка запросов в execute
 *  + Автоматическая загрузка списков
 *
 *
 *  Методы:
 *      API({access_token?, service_token, threads = 10});
 *      API.fetch(method, args, config);
 *
 */

export class API {
  private readonly access_token = '';
  private readonly service_token = '';
  private readonly service_queue = new PriorityQueue({ comparator: (a, b) => b.priority > a.priority });
  private readonly private_queue = new PriorityQueue({ comparator: (a, b) => b.priority > a.priority });
  private readonly service_workers = new Set<(any)=>void>();
  private private_worker: (false | ((any)=>void)) = false;

  constructor({ access_token, service_token, threads = 10 }) {
    this.access_token = access_token;
    this.service_token = service_token;

    // create N workers for unprivileged tasks
    for (let i = 0; i < threads; ++i) {
      const worker = (task) => {
        this.service_workers.delete(worker);
        API.raw_request(task.method, task.params, this.service_token).nodeify((error, result) => {
          if (this.service_queue.empty()) this.service_workers.add(worker);
          else worker(this.service_queue.poll());
          task.callback(error, result);
        });
      };
      if (this.service_queue.isEmpty()) this.service_workers.add(worker);
      else worker(this.service_queue.poll());
    }

    // only one worker for private queue because of api limits
    // to use more than one worker, create another instance of API
    // with another private token
    const worker = (task) => {
      this.private_worker = false;
      API.raw_request(task.method, task.params, this.access_token).nodeify((error, result) => {
        // api limits request interval for 1/3s
        setTimeout(() => {
          this.pack_private_queue_into_execute();
          if (this.private_queue.isEmpty()) this.private_worker = worker;
          else worker(this.private_queue.poll());
        }, 340);
        task.callback(error, result);
      });
    };

    this.private_worker = worker;
  }

  /**
   * Fetch all items from APIs that returns {count, items} structure
   * todo: set `count` with max value from api docs
   *
   * @arg method - API method to call
   * @arg params - API method arguments
   *
   * @arg [priority=10] - Request priority
   * @arg [limit=Infinity] - Max items
   * @arg [silent=true] - Return empty list on error
   * @arg [force_private=false] - Use only private access token
   */
  public async fetch(method, params, { priority = 10, limit = Infinity, silent = true, force_private = false }) {
    try {
      const { items } = await this.enqueue(method, params, { priority, force_private });
      while (items.length < limit) {
        const next_part = (await this.enqueue(
          method,
          Object.assign(
            {
              offset: items.length,
            },
            params,
          ),
          { priority, force_private },
        )).items;
        if (!next_part.length) return items;
        items.push(...next_part);
      }
    } catch (E) {
      if (silent) return [];
      else throw E;
    }
  }

  /**
   *
   * @arg method - API method to call
   * @arg params - API method arguments
   *
   * @arg [priority=10] -
   * @arg [force_private=false] -
   */
  public async enqueue(method, params, { priority = 10, force_private = false }) {
    // push request into queue, set callback and wrap as promise
    const push_promise = (queue, params) => {
      const promise = new Promise((fulfill, reject) => {
        queue.add(
          Object.assign(
            {
              callback: (error, response) => (error ? reject(error) : fulfill(response)),
            },
            params,
          ),
        );
      });

      // trigger workers
      if (this.private_worker) this.private_worker(this.private_queue.poll());
      if (this.service_workers.size) this.service_workers.keys().next().value(this.service_queue.poll());

      return promise;
    };

    // determine which token to use
    // todo: cache access errors
    if (force_private) return await push_promise(this.private_queue, { method, params, priority });
    if (!this.access_token) return await push_promise(this.service_queue, { method, params, priority });
    try {
      return await push_promise(this.service_queue, { method, params, priority });
    } catch (E) {
      if (
        // access errors
        E.error_code === 15 ||
        E.error_code === 30 ||
        E.error_code === 200 ||
        E.error_code === 201 ||
        E.error_code === 203
      ) {
        return await push_promise(this.private_queue, { method, params, priority: priority + 1 });
      }
      throw E;
    }
  }

  private pack_private_queue_into_execute() {
    const calls = [];
    const failed = [];

    // calculate approx request weight to meet api limits
    const get_weight = (request) => {
      if (request.execute_failed) return 101; // 101 means that request would not be packed into execute
      if (request.method === 'friends.get') return request.params.has('fields') ? 101 : 14;
      if (request.method === 'users.get')
        return 40 + 8 * (request.params.fields && request.params.fields.split(',').length);
      return 101;
    };

    // choose requests to pack
    const max_weight = 100;
    const threshold = 14; // basically is a minimum possible return value for get_weight()
    for (let total_weight = 0; !this.private_queue.isEmpty() && total_weight <= max_weight + threshold; ) {
      const request = this.private_queue.poll();
      const weight = get_weight(request);

      if (total_weight + weight > max_weight) failed.push(request);
      else {
        calls.push(request);
        total_weight += weight;
      }
    }

    for (let f of failed) this.private_queue.add(f);

    // vkscript code
    const code =
      'return [' + calls.map((call) => `API.${call.method}({${JSON.stringify(call.params)})`).join(',') + '];';

    // put packed request on top of the queue
    this.private_queue.add({
      method: 'execute',
      priority: 100,
      params: { code },
      callback(error, response) {
        if (error) {
          // todo: if error is only for one request, mark only it
          // todo: else retry with 1/2 of total_weight
          for (let f of calls) {
            f.priority += 89; // next execute() call will be preferred over requests with p<=10
            f.execute_failed = true;
            this.private_queue.push(f);
          }

          // trigger worker
          if (this.private_worker) this.private_worker(this.private_queue.poll());
        } else for (let i = 0; i < calls.length; ++i) setTimeout(calls[i].callback, 0, null, response[i]);
      },
    });
  }

  private static async raw_request(method, params, token, retries = 7) {
    // Generate query string for GET request
    const query_string = Object.keys(params)
      .map((key) => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');

    for (let retry = 0; retry < retries; ++retry) {
      try {
        return (await fetch(`https://api.vk.com/method/${method}?${query_string}`)).json();
      } catch (e) {
        /* no matter, retry */
      }
    }
    throw { error: 'ETIMEOUT after N retries', error_code: 0 };
  }
}