import axios from 'axios';

export function createWorkerHttpClient() {
    // Axiosの既定cache=defaultはWorkersが拒否し、GitHub/OAuth通信までTypeErrorになる。
    return axios.create({ adapter: 'fetch', fetchOptions: { cache: 'no-store' } });
}
