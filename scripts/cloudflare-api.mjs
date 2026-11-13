import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function cloudflareToken() {
    if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
    const result = execFileSync(process.execPath, [path.join(root,'node_modules/wrangler/bin/wrangler.js'), 'auth','token','--json'], { encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe'] });
    const credentials = JSON.parse(result);
    if (!credentials.token) throw new Error('Run wrangler login or configure CLOUDFLARE_API_TOKEN');
    return credentials.token;
}
export async function cloudflareRequest(token, route, options = {}) {
    const response = await fetch('https://api.cloudflare.com/client/v4' + route, { ...options, headers: { Authorization:'Bearer '+token, 'Content-Type':'application/json', ...options.headers }, signal:AbortSignal.timeout(30_000) });
    const result = await response.json();
    // Cloudflareの生エラーには接続情報が含まれうるため、識別用コードだけ返す。
    if (!response.ok || !result.success) throw new Error('Cloudflare API '+response.status+' codes: '+(result.errors || []).map(item=>item.code).join(','));
    return result.result;
}
