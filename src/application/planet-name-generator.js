// 惑星名の形式はHTTPデバッグ経路と通常生成で共通のプロダクト仕様として扱う。
export function requestPlanetName(ask, { mainLanguage, planetColor, totalCommits }) {
    const suffix = totalCommits > 1000 ? '帝星' : totalCommits > 500 ? '巨星' : '星';
    return ask(`Programming language: ${mainLanguage}. Color: ${planetColor}.
    Generate a cool Japanese planet name in the format: "[Adjective][ColorName]の${suffix}".
    The adjective should describe the nature of "${mainLanguage}". The color name should describe the color "${planetColor}".
    Example: "JavaScript" -> "柔軟な黄金の${suffix}".
    Return ONLY the name string.`);
}
