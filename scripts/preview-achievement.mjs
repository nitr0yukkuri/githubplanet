import { spawn } from 'node:child_process';

const previewUrl = 'http://localhost:3000/?preview-achievement=1';

if (process.argv.includes('--print-url')) {
    console.log(previewUrl);
    process.exit(0);
}

try {
    const response = await fetch(previewUrl, {
        signal: AbortSignal.timeout(2000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch {
    console.error('開発サーバーが起動していません。先に npm run dev を実行してください。');
    process.exit(1);
}

let command;
let args;

if (process.platform === 'win32') {
    command = 'powershell.exe';
    args = [
        '-NoProfile',
        '-WindowStyle',
        'Hidden',
        '-Command',
        'Start-Process',
        '-FilePath',
        previewUrl
    ];
} else if (process.platform === 'darwin') {
    command = 'open';
    args = [previewUrl];
} else {
    command = 'xdg-open';
    args = [previewUrl];
}

const browserProcess = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
});
browserProcess.unref();

console.log(`実績通知のプレビューを開きました: ${previewUrl}`);
