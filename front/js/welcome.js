// このスクリプトは welcome.html だけで読み込まれます
document.addEventListener('DOMContentLoaded', () => {
    const okButton = document.getElementById('welcome-ok-btn');

    okButton.addEventListener('click', () => {
        // ★ 「OK」が押されたら /planet (inaadex.html) に移動します
        window.location.href = '/planet';
    });
});