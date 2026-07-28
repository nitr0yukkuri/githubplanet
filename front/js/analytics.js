const GA_MEASUREMENT_ID = 'G-6X54Y51TTZ';
const PRODUCTION_HOSTNAME = 'githubplanet-git-543426763451.asia-northeast2.run.app';

const isProductionSite = window.location.hostname === PRODUCTION_HOSTNAME;
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
