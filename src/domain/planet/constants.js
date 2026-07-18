export const DATA_CACHE_DURATION = 60 * 60 * 1000;
export const MAX_TOTAL_COMMITS = 99999;
export const MAX_WEEKLY_COMMITS = 100;

export const LANGUAGE_COLORS = {
    JavaScript: '#f0db4f', TypeScript: '#007acc', Python: '#306998', HTML: '#e34c26', CSS: '#563d7c',
    Ruby: '#CC342D', Java: '#b07219', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
    Go: '#00ADD8', Rust: '#dea584', PHP: '#4F5D95',
    Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051', Dart: '#00B4AB',
    Scala: '#c22d40', Perl: '#0298c3', Lua: '#000080', Haskell: '#5e5086',
    R: '#198CE7', Julia: '#a270ba', Vue: '#41b883', Dockerfile: '#384d54',
    Svelte: '#ff3e00', Elixir: '#6e4a7e', 'Objective-C': '#438eff', VimScript: '#199f4b',
    Batchfile: '#C1F12E', PowerShell: '#012456', Markdown: '#083fa1', JSON: '#292929',
    YAML: '#cb171e', SQL: '#e38c00', GraphQL: '#e10098', Terraform: '#623ce4'
};

export const EXTENSION_MAP = {
    js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
    py: 'Python', ipynb: 'Python', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS', sass: 'CSS',
    java: 'Java', jar: 'Java', rb: 'Ruby', erb: 'Ruby', c: 'C', h: 'C', cpp: 'C++', hpp: 'C++',
    cc: 'C++', cs: 'C#', csx: 'C#', go: 'Go', rs: 'Rust', php: 'PHP', swift: 'Swift',
    kt: 'Kotlin', kts: 'Kotlin', sh: 'Shell', bash: 'Shell', zsh: 'Shell', dart: 'Dart',
    scala: 'Scala', pl: 'Perl', pm: 'Perl', lua: 'Lua', hs: 'Haskell', r: 'R', jl: 'Julia',
    vue: 'Vue', svelte: 'Svelte', ex: 'Elixir', exs: 'Elixir', m: 'Objective-C', mm: 'Objective-C',
    vim: 'VimScript', bat: 'Batchfile', cmd: 'Batchfile', ps1: 'PowerShell', md: 'Markdown',
    markdown: 'Markdown', json: 'JSON', yaml: 'YAML', yml: 'YAML', sql: 'SQL', graphql: 'GraphQL',
    gql: 'GraphQL', tf: 'Terraform'
};

export const ACHIEVEMENTS = {
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めての惑星を作成した。' },
    FIRST_COMMIT: { id: 'FIRST_COMMIT', name: '星の産声', description: '初めて活動を行った。' },
    VELOCITY_STAR: { id: 'VELOCITY_STAR', name: '光速の星', description: '爆発的な開発スピードで宇宙を駆け抜け、週間50コントリビューション以上を記録した。' },
    OS_CONTRIBUTOR: { id: 'OS_CONTRIBUTOR', name: '銀河の貢献者', description: '他の星系に文明をもたらし、他リポジトリへの貢献を果たした。' },
    STARGAZER: { id: 'STARGAZER', name: '星を見上げる者', description: '多くの輝きを知り、または自身が輝き、Star数10以上を達成した。' },
    POLYGLOT_PIONEER: { id: 'POLYGLOT_PIONEER', name: '多言語の開拓者', description: '多様な技術を操り、5種類以上の言語で彩り豊かな惑星を築き上げた。' },
    OCTOCAT_FRIEND: { id: 'OCTOCAT_FRIEND', name: '星界の盟友', description: '長い間この宇宙を旅し、登録から1年以上が経過した。' },
    COMMIT_100: { id: 'COMMIT_100', name: 'コントリビューション100', description: '累計活動数が100を超えた。' },
    COMMIT_500: { id: 'COMMIT_500', name: 'コントリビューション500', description: '累計活動数が500を超えた。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: 'コントリビューション1000', description: '累計活動数が1000を超えた。' }
};

export const TITLE_REWARDS = {
    FIRST_PLANET: { prefix: '始まりの', suffix: '創造主' },
    FIRST_COMMIT: { prefix: '記念すべき', suffix: '第一歩' },
    VELOCITY_STAR: { prefix: '光速の', suffix: '彗星' },
    OS_CONTRIBUTOR: { prefix: '銀河の', suffix: '貢献者' },
    STARGAZER: { prefix: '輝く', suffix: '一番星' },
    POLYGLOT_PIONEER: { prefix: '多才な', suffix: '翻訳家' },
    OCTOCAT_FRIEND: { prefix: '古参の', suffix: '盟友' },
    COMMIT_100: { prefix: '努力の', suffix: '職人' },
    COMMIT_500: { prefix: '熟練の', suffix: '達人' },
    COMMIT_1000: { prefix: '伝説の', suffix: '英雄' }
};
