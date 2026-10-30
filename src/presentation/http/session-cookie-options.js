export function createSessionCookieOptions(isProduction) {
    return {
        // Firebase Hostingが転送する予約Cookie名を使い、OAuth往復のstateを保持する。
        name: isProduction ? '__session' : 'connect.sid',
        cookie: { secure: isProduction, httpOnly: true, sameSite: 'lax' }
    };
}
