const GA_MEASUREMENT_ID = 'G-96E74LPVN6';
const PRODUCTION_HOSTNAMES = new Set([
    'githubplanet.dev',
    'www.githubplanet.dev',
    'githubplanet-git-543426763451.asia-northeast2.run.app'
]);

const isProductionSite = PRODUCTION_HOSTNAMES.has(window.location.hostname);
const isAutomatedCardCapture = new URLSearchParams(window.location.search).has('fix');

if (isProductionSite && !isAutomatedCardCapture) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
        window.dataLayer.push(arguments);
    };

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.append(script);
}
