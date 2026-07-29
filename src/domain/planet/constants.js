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
    FIRST_PLANET: { id: 'FIRST_PLANET', name: '最初の星', description: '初めて惑星を作成。' },
    FIRST_COMMIT: { id: 'FIRST_COMMIT', name: '星の産声', description: '初コントリビューション達成。' },
    VELOCITY_STAR: { id: 'VELOCITY_STAR', name: '光速の星', description: '週間50コントリビューション達成。' },
    OS_CONTRIBUTOR: { id: 'OS_CONTRIBUTOR', name: '銀河の貢献者', description: '他のリポジトリに貢献。' },
    FIRST_CONTACT: { id: 'FIRST_CONTACT', name: '最初の交信', description: '自分以外が所有するリポジトリでプルリクエストがマージされた。' },
    STARGAZER: { id: 'STARGAZER', name: '星を見上げる者', description: 'Star 10件達成。' },
    POLYGLOT_PIONEER: { id: 'POLYGLOT_PIONEER', name: '多言語の開拓者', description: '5言語以上を使用。' },
    DUAL_WORLD_BRIDGE: { id: 'DUAL_WORLD_BRIDGE', name: '二つの世界を繋ぐ者', description: '2つの言語でそれぞれ10,000バイト以上を記録。' },
    OCTOCAT_FRIEND: { id: 'OCTOCAT_FRIEND', name: '星界の盟友', description: 'GitHub登録から1年経過。' },
    COMMIT_100: { id: 'COMMIT_100', name: '星の歩み', description: '100コントリビューション達成。' },
    COMMIT_500: { id: 'COMMIT_500', name: '軌道の旅人', description: '500コントリビューション達成。' },
    COMMIT_1000: { id: 'COMMIT_1000', name: '星雲の航海者', description: '1,000コントリビューション達成。' },
    CONTRIBUTION_10000: { id: 'CONTRIBUTION_10000', name: '銀河に名を刻む者', description: '10,000コントリビューション達成。' }
};

export const TITLE_REWARDS = {
    FIRST_PLANET: { prefix: '始まりの', suffix: '創造主' },
    FIRST_COMMIT: { prefix: '記念すべき', suffix: '第一歩' },
    VELOCITY_STAR: { prefix: '光速の', suffix: '彗星' },
    OS_CONTRIBUTOR: { prefix: '銀河の', suffix: '貢献者' },
    FIRST_CONTACT: { prefix: '星間の', suffix: '交信者' },
    STARGAZER: { prefix: '輝く', suffix: '一番星' },
    POLYGLOT_PIONEER: { prefix: '多才な', suffix: '翻訳家' },
    DUAL_WORLD_BRIDGE: { prefix: '双界の', suffix: '架け橋' },
    OCTOCAT_FRIEND: { prefix: '古参の', suffix: '盟友' },
    COMMIT_100: { prefix: '星を歩む', suffix: '探索者' },
    COMMIT_500: { prefix: '軌道を巡る', suffix: '旅人' },
    COMMIT_1000: { prefix: '星雲を渡る', suffix: '航海者' },
    CONTRIBUTION_10000: { prefix: '銀河に名を刻む', suffix: '伝説' }
};
