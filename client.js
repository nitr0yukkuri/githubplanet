// client.js (ブラウザ側で動くJavaScript)

// ページが読み込まれたら、まずサーバーに「私は誰？」と聞く
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/me');

        if (!response.ok) {
            // セッションが切れているか、未ログイン
            console.log('ログインしていません');
            document.getElementById('login-btn').style.display = 'block';
            document.getElementById('info').style.display = 'none';
            return;
        }

        // ログイン成功時の処理
        const data = await response.json();
        console.log('ユーザーデータ:', data);

        // ログインボタンを隠す
        document.getElementById('login-btn').style.display = 'none';

        // 惑星情報を表示
        const infoDiv = document.getElementById('info');
        infoDiv.style.display = 'block';

        document.getElementById('username').textContent = data.user.login;
        document.getElementById('language').textContent = data.planetData.mainLanguage;

        // 惑星の色を適用
        document.getElementById('planet').style.backgroundColor = data.planetData.planetColor;

    } catch (error) {
        console.error('データ取得エラー:', error);
    }
});